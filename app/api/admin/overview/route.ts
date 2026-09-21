import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, canViewFinancials } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getLiveClientStats } from '@/lib/clientStats';
import { getClientAdPerformance } from '@/lib/adPerformance';

// Runs `fn` over `items` with at most `limit` in flight. Every client used to hit
// Meta and GoHighLevel at once, which on a cold cache is the burst that trips rate limits.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const showFinancials = canViewFinancials(user.email);

  const db = getDb();

  const clients = db.prepare(`
    SELECT
      c.*,
      COUNT(q.id)                                                                AS total_quotes,
      COALESCE(SUM(q.value), 0)                                                  AS total_quoted_value,
      COUNT(CASE WHEN q.status = 'closed' THEN 1 END)                            AS closed_deals,
      COALESCE(SUM(CASE WHEN q.status = 'closed' THEN q.value ELSE 0 END), 0)   AS revenue_closed,
      CAST((julianday('now') - julianday(c.start_date)) AS INTEGER)              AS days_as_client,
      ROUND(
        (julianday('now') - julianday(c.start_date)) / 30.0
      ) * COALESCE(c.retainer_price, 0)                                          AS total_payments_received,
      (SELECT cn.client_sentiment FROM call_notes cn
       WHERE cn.client_id = c.id AND cn.call_type = 'checkin' AND cn.client_sentiment IS NOT NULL
       ORDER BY cn.id DESC LIMIT 1)                                              AS latest_sentiment
    FROM clients c
    LEFT JOIN quotes q ON q.client_id = c.id
    WHERE c.onboard_status != 'pending'
    GROUP BY c.id
    ORDER BY c.start_date DESC
  `).all() as any[];

  // Pull live GHL leads/in-home counts + live ad spend (Meta > manual > estimate)
  // for every client in parallel, instead of relying on stale per-client cache —
  // this is the same priority logic the individual client dashboard uses.
  const agencyGhlKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
  // ?refresh=1 (the Sync button) skips the 10-minute Meta cache; a failed refresh
  // still falls back to the last good figure, marked stale.
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  const enriched = await mapLimit(clients, 6, async (c) => {
    let row = {
      ...c,
      total_ad_spend: c.ad_spend || (c.daily_ad_spend * c.days_as_client),
      // Where the figure above came from + whether Meta is actually syncing. The
      // fallback (manual/estimate) is shown for any failure, so without these the
      // UI can't tell a live number from a stand-in — see lib/clientStats.ts.
      spend_source: (c.ad_spend > 0 ? 'manual' : 'estimate') as 'meta' | 'manual' | 'estimate',
      has_meta_credentials: !!(c.meta_access_token && c.meta_ad_account_id),
      meta_error: null as string | null,
      // The figure is Meta's last real answer rather than a fresh one (a refresh
      // failed), and when that answer is from.
      meta_stale: false,
      meta_fetched_at: null as number | null,
      // Meta is answering fine and says $0 was spent since launch — ads paused, a
      // billing problem, or the wrong ad account. Without this the page quietly
      // shows the daily-budget estimate instead.
      meta_zero: false,
      // Set when the GHL pull failed — cached_leads/cached_inhome below are then
      // the last saved counts, and last_lead_at is unknown rather than "never".
      ghl_error: null as string | null,
      meta_connected: false, best_ad_cpl: null as number | null, last_lead_at: null as string | null, contact_pct: null as number | null, appointments: 0,
    };
    try {
      const live = await getLiveClientStats(c, agencyGhlKey, { refresh });
      if (live.leads !== c.cached_leads || live.inhome !== c.cached_inhome) {
        db.prepare('UPDATE clients SET cached_leads = ?, cached_inhome = ? WHERE id = ?').run(live.leads, live.inhome, c.id);
      }
      // Contact % = (contacted + any appointment) / total leads
      const contactedOrAppt = live.contacted + live.phone + live.inhome;
      // When the GHL pull failed only the saved lead / in-home totals exist —
      // contacted and phone are 0 — so a percentage or appointment count built
      // from them would be wrong rather than merely stale. Leave them blank.
      const ghlDown = !!live.ghlError;
      row = {
        ...row,
        cached_leads: live.leads, cached_inhome: live.inhome,
        total_ad_spend: live.totalAdSpend, meta_connected: live.metaConnected,
        spend_source: live.spendSource, has_meta_credentials: live.hasMetaCredentials, meta_error: live.metaError, ghl_error: live.ghlError,
        meta_stale: live.metaStale, meta_fetched_at: live.metaFetchedAt,
        meta_zero: live.metaZeroSpend && !!c.date_launched && c.date_launched <= new Date().toISOString().slice(0, 10),
        contact_pct: !ghlDown && live.leads > 0 ? (contactedOrAppt / live.leads) * 100 : null,
        // Appointments = phone + in-home appointments combined
        appointments: ghlDown ? 0 : live.phone + live.inhome,
      };
    } catch (e: any) {
      // Unexpected (not a Meta/GHL API failure — those are handled inside
      // getLiveClientStats). Keep the fallback figures above, but say so.
      console.error(`[overview] live stats failed for ${c.name} (client #${c.id}): ${e?.message ?? e}`);
    }

    try {
      const perf = await getClientAdPerformance(c, agencyGhlKey, { refresh });
      row.best_ad_cpl = perf.bestCpl;
      row.last_lead_at = perf.lastLeadAt;
      // Either Meta call may be the one that trips (rate limits hit one and not
      // the other) — keep whichever reason there is.
      if (!row.meta_error && perf.metaError) row.meta_error = perf.metaError;
    } catch (e: any) {
      console.error(`[overview] ad performance failed for ${c.name} (client #${c.id}): ${e?.message ?? e}`);
    }

    return row;
  });

  // Never send the raw Meta token / GHL key to the browser — this endpoint
  // previously returned the whole clients row (c.*), so every client's live
  // credentials were sitting in the network response for anyone with the tracker
  // open (including admins who aren't allowed to see financials). The page only
  // needs to know whether they exist, which has_meta_credentials covers.
  const withoutSecrets = enriched.map(({ meta_access_token: _m, ghl_api_key: _g, ...rest }: any) => ({
    ...rest, has_ghl_key: !!_g,
  }));

  const finalRows = showFinancials
    ? withoutSecrets
    : withoutSecrets.map(r => ({ ...r, retainer_price: null, total_payments_received: null }));

  return NextResponse.json(finalRows);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, client_status, internal_notes, checkin_count, testimonial_collected } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getDb();
  db.prepare(`
    UPDATE clients SET
      client_status         = COALESCE(?, client_status),
      internal_notes        = COALESCE(?, internal_notes),
      checkin_count         = COALESCE(?, checkin_count),
      testimonial_collected = COALESCE(?, testimonial_collected)
    WHERE id = ?
  `).run(
    client_status ?? null,
    internal_notes ?? null,
    checkin_count ?? null,
    testimonial_collected ?? null,
    id
  );

  return NextResponse.json({ ok: true });
}

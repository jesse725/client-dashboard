import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getLiveClientStats } from '@/lib/clientStats';
import { getClientAdPerformance } from '@/lib/adPerformance';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const enriched = await Promise.all(clients.map(async (c) => {
    let row = { ...c, total_ad_spend: c.ad_spend || (c.daily_ad_spend * c.days_as_client), meta_connected: false, best_ad_cpl: null as number | null, last_lead_at: null as string | null };
    try {
      const live = await getLiveClientStats(c, agencyGhlKey);
      if (live.leads !== c.cached_leads || live.inhome !== c.cached_inhome) {
        db.prepare('UPDATE clients SET cached_leads = ?, cached_inhome = ? WHERE id = ?').run(live.leads, live.inhome, c.id);
      }
      row = { ...row, cached_leads: live.leads, cached_inhome: live.inhome, total_ad_spend: live.totalAdSpend, meta_connected: live.metaConnected };
    } catch { /* keep fallback total_ad_spend above */ }

    try {
      const perf = await getClientAdPerformance(c, agencyGhlKey);
      row.best_ad_cpl = perf.bestCpl;
      row.last_lead_at = perf.lastLeadAt;
    } catch { /* leave best_ad_cpl/last_lead_at null */ }

    return row;
  }));

  return NextResponse.json(enriched);
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

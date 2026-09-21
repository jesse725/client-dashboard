import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchGHLPipelineStats, resolveApiKey } from '@/lib/ghl';
import { metaErrorMessage } from '@/lib/meta';
import { ageLabel } from '@/lib/metaCache';
import { getMetaSpend } from '@/lib/clientStats';
import { Client } from '@/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client;
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!client.ghl_location_id || !client.ghl_pipeline_id) {
    return NextResponse.json({ leads: 0, contacted: 0, unqualified: 0, phone: 0, inhome: 0 });
  }

  const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
  const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);

  // GHL and Meta are independent — one failing must not blank the other, and
  // (for admins) the reason has to come back instead of just disappearing.
  const isAdmin = user.role === 'admin';
  // Meta stats are scoped to the partnership window (start_date to today, so a
  // shared/reused ad account doesn't pull in pre-partnership spend) and cached —
  // the same cached figure the Client Tracker uses, so the two always agree.
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  let metaError: string | null = null;
  const metaPromise = client.meta_access_token && client.meta_ad_account_id
    ? getMetaSpend(client, { refresh }).then((got) => {
        if (got.stale) {
          metaError = `${got.error} Showing the last figure Meta returned, from ${ageLabel(got.fetchedAt)}.`;
          console.error(`[meta] ${client.name} (client #${client.id}): ${got.error} — serving the figure from ${ageLabel(got.fetchedAt)}`);
        }
        return got.value;
      }).catch((e) => {
        metaError = metaErrorMessage(e);
        console.error(`[meta] ${client.name} (client #${client.id}): ${metaError}`);
        return null;
      })
    : Promise.resolve(null);

  let pipeline = { leads: client.cached_leads ?? 0, contacted: 0, unqualified: 0, phone: 0, inhome: client.cached_inhome ?? 0 };
  let ghlError: string | null = null;
  try {
    if (!apiKey) {
      throw new Error('No GoHighLevel API key is saved for this client and no agency key is set (Admin Settings > GHL Sync).');
    }
    pipeline = await fetchGHLPipelineStats(apiKey, client.ghl_location_id, client.ghl_pipeline_id, {
      leads: client.stage_leads ?? undefined,
      contacted: client.stage_contacted ?? undefined,
      unqualified: client.stage_unqualified ?? undefined,
      phone: client.stage_phone ?? undefined,
      inhome: client.stage_inhome ?? undefined,
    }, { strict: true });
    // Cache pipeline counts for tracker view — only after a REAL success. This
    // used to run on the lenient fetch, so any GHL failure (bad/blank key,
    // rate limit) returned zeros here and overwrote the good cached counts with
    // 0, which then fed the tracker's leads and CPL until the next good fetch.
    db.prepare('UPDATE clients SET cached_leads = ?, cached_inhome = ? WHERE id = ?')
      .run(pipeline.leads ?? 0, pipeline.inhome ?? 0, id);
  } catch (e: any) {
    ghlError = e?.message ?? String(e);
    console.error(`[ghl] ${client.name} (client #${client.id}): ${ghlError}`);
    // pipeline stays at the last-known cached counts
  }

  const metaStats = await metaPromise;
  return NextResponse.json({
    pipeline, metaStats,
    // Extra diagnostics for admins only — clients shouldn't see agency internals.
    ...(isAdmin && (metaError || ghlError) ? { syncIssues: { meta: metaError, ghl: ghlError ? `${ghlError} Showing the last saved lead counts.` : null } } : {}),
  });
}

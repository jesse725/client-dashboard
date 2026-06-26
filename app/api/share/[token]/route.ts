import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fetchGHLPipelineStats, resolveApiKey } from '@/lib/ghl';
import { fetchMetaAdStats } from '@/lib/meta';
import { calcMetrics } from '@/lib/metrics';
import { Client, Quote } from '@/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const client = db.prepare('SELECT * FROM clients WHERE share_token = ?').get(token) as Client | undefined;
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const quotes = db
    .prepare('SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC')
    .all(client.id) as Quote[];

  // GHL pipeline
  let pipeline = { leads: 0, contacted: 0, unqualified: 0, phone: 0, inhome: 0 };
  if (client.ghl_location_id && client.ghl_pipeline_id) {
    const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
    const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);
    try {
      pipeline = await fetchGHLPipelineStats(apiKey, client.ghl_location_id, client.ghl_pipeline_id, {
        leads: client.stage_leads ?? undefined,
        contacted: client.stage_contacted ?? undefined,
        unqualified: client.stage_unqualified ?? undefined,
        phone: client.stage_phone ?? undefined,
        inhome: client.stage_inhome ?? undefined,
      });
    } catch { /* zeros */ }
  }

  // Meta Ads
  let metaStats = null;
  if (client.meta_access_token && client.meta_ad_account_id) {
    try {
      metaStats = await fetchMetaAdStats(client.meta_access_token, client.meta_ad_account_id);
    } catch { /* null */ }
  }

  const metrics = calcMetrics(client, quotes, pipeline, metaStats?.spend);

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      logo_url: client.logo_url,
      retainer_price: client.retainer_price,
      ad_spend: client.ad_spend,
      daily_ad_spend: client.daily_ad_spend,
      start_date: client.start_date,
      contract_url: client.contract_url,
      slack_url: client.slack_url,
      next_checkin: client.next_checkin,
      date_launched: client.date_launched,
      date_billed: client.date_billed,
      rebilling_date: client.rebilling_date,
    },
    pipeline,
    metaStats,
    quotes: quotes.map(q => ({
      id: q.id,
      customer_name: q.customer_name,
      value: q.value,
      status: q.status,
      drive_url: q.drive_url,
      notes: q.notes,
      created_at: q.created_at,
    })),
    metrics,
  });
}

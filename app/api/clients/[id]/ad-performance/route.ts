import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchGHLOpportunitiesRaw, resolveApiKey } from '@/lib/ghl';
import { fetchMetaAdLevelStats } from '@/lib/meta';
import { Client } from '@/types';

export interface AdPerformanceRow {
  adId: string;
  adName: string;
  spend: number;
  leads: number;
  cpl: number | null; // null when this ad has 0 attributed leads
  impressions: number;
  clicks: number;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  if (!client.meta_access_token || !client.meta_ad_account_id) {
    return NextResponse.json({ ads: [], reason: 'meta_not_connected' });
  }

  const since = client.start_date;
  const until = new Date().toISOString().slice(0, 10);

  try {
    const adStats = await fetchMetaAdLevelStats(client.meta_access_token, client.meta_ad_account_id, since, until);

    // Count leads per ad from GHL's UTM attribution (utmAdId), if this client's
    // pipeline is connected — otherwise we can only show spend, no CPL.
    const leadsByAdId = new Map<string, number>();
    if (client.ghl_location_id && client.ghl_pipeline_id) {
      const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
      const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);
      const opps = await fetchGHLOpportunitiesRaw(apiKey, client.ghl_location_id, client.ghl_pipeline_id);
      for (const o of opps) {
        if (new Date(o.createdAt) < new Date(since)) continue;
        const adId = o.attributions?.find(a => a.utmAdId)?.utmAdId;
        if (adId) leadsByAdId.set(adId, (leadsByAdId.get(adId) ?? 0) + 1);
      }
    }

    const rows: AdPerformanceRow[] = adStats
      .filter(a => a.spend > 0)
      .map(a => {
        const leads = leadsByAdId.get(a.adId) ?? 0;
        return {
          adId: a.adId,
          adName: a.adName,
          spend: a.spend,
          leads,
          cpl: leads > 0 ? a.spend / leads : null,
          impressions: a.impressions,
          clicks: a.clicks,
        };
      })
      // Best CPL first; ads with no leads yet sort to the bottom (they're the
      // ones most likely to need swapping if spend is building up with no results)
      .sort((a, b) => {
        if (a.cpl == null && b.cpl == null) return b.spend - a.spend;
        if (a.cpl == null) return 1;
        if (b.cpl == null) return -1;
        return a.cpl - b.cpl;
      });

    return NextResponse.json({ ads: rows });
  } catch (e: any) {
    return NextResponse.json({ ads: [], error: e.message }, { status: 200 });
  }
}

import { getDb } from './db';
import { fetchGHLOpportunitiesRaw, resolveApiKey } from './ghl';
import { fetchMetaAdLevelStats } from './meta';
import { Client } from '@/types';

export interface AdPerformanceRow {
  adId: string;
  adName: string;
  spend: number;
  leads: number;
  cpl: number | null; // null when this ad has 0 attributed leads
  impressions: number;
  clicks: number;
  lastLeadAt: string | null; // ISO date of the most recent lead attributed to this ad
}

export interface ClientAdPerformance {
  ads: AdPerformanceRow[];
  bestCpl: number | null; // lowest CPL among ads that have at least one lead
  lastLeadAt: string | null; // most recent lead across the WHOLE pipeline (not just ad-attributed)
}

// Single source of truth for per-ad CPL + last-lead tracking — used by both
// the individual client dashboard and the admin Client Tracker overview.
export async function getClientAdPerformance(client: Client, agencyGhlKey: string): Promise<ClientAdPerformance> {
  const since = client.start_date;
  const until = new Date().toISOString().slice(0, 10);

  let opps: { id: string; createdAt: string; attributions?: { utmAdId?: string }[] }[] = [];
  if (client.ghl_location_id && client.ghl_pipeline_id) {
    const apiKey = resolveApiKey(client.ghl_api_key, agencyGhlKey);
    opps = await fetchGHLOpportunitiesRaw(apiKey, client.ghl_location_id, client.ghl_pipeline_id);
  }

  // Last lead across the whole pipeline, regardless of ad attribution or Meta connection.
  let lastLeadAt: string | null = null;
  for (const o of opps) {
    if (!lastLeadAt || new Date(o.createdAt) > new Date(lastLeadAt)) lastLeadAt = o.createdAt;
  }

  if (!client.meta_access_token || !client.meta_ad_account_id) {
    return { ads: [], bestCpl: null, lastLeadAt };
  }

  const adStats = await fetchMetaAdLevelStats(client.meta_access_token, client.meta_ad_account_id, since, until);

  const leadsByAdId = new Map<string, number>();
  const lastLeadByAdId = new Map<string, string>();
  for (const o of opps) {
    if (new Date(o.createdAt) < new Date(since)) continue;
    const adId = o.attributions?.find(a => a.utmAdId)?.utmAdId;
    if (!adId) continue;
    leadsByAdId.set(adId, (leadsByAdId.get(adId) ?? 0) + 1);
    const prevLatest = lastLeadByAdId.get(adId);
    if (!prevLatest || new Date(o.createdAt) > new Date(prevLatest)) {
      lastLeadByAdId.set(adId, o.createdAt);
    }
  }

  const ads: AdPerformanceRow[] = adStats
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
        lastLeadAt: lastLeadByAdId.get(a.adId) ?? null,
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

  const cplValues = ads.map(a => a.cpl).filter((v): v is number => v != null);
  const bestCpl = cplValues.length > 0 ? Math.min(...cplValues) : null;

  return { ads, bestCpl, lastLeadAt };
}

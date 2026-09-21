import { fetchGHLOpportunitiesRaw, resolveApiKey } from './ghl';
import { cleanMetaToken, fetchMetaAdLevelStats, metaErrorMessage, metaWindow, normalizeAdAccountId } from './meta';
import { ageLabel, cachedMeta } from './metaCache';
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
  metaError: string | null; // Meta credentials are saved but the ad-level call failed (or is stale) — why
}

// ── Lead → ad attribution ───────────────────────────────────────────────────
// A lead can only be credited to an ad if GoHighLevel recorded which ad it came
// from. Two things can be recorded: the ad's ID, and — under GoHighLevel's own
// recommended Facebook setup (utm_content={{ad.name}}) — the ad's NAME. This
// used to look at the ID alone, so a client using that standard setup had every
// lead silently unattributed and no ad ever showed a lead or a cost-per-lead.
export interface AttributableOpp {
  id: string;
  createdAt: string;
  attributions?: Record<string, unknown>[];
}

export interface AttributionResult {
  leadsByAd: Map<string, number>;
  lastLeadByAd: Map<string, string>;
  windowLeads: number; // leads created on/after `since`
  viaId: number; // matched to a Meta ad by its ID
  viaName: number; // matched by ad name (only when exactly one Meta ad has that name)
  unmatched: number; // carried an ad ID/name that no Meta ad in the window has (deleted, other account, renamed…)
  none: number; // carried no ad identifier at all
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

// Every ad ID / ad name GoHighLevel attached to a lead. Field names beyond
// utmAdId/utmContent are what GoHighLevel's attribution exports use for the same
// things; unknown ones are simply absent.
export function adReferences(o: AttributableOpp): { ids: string[]; names: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  for (const a of o.attributions ?? []) {
    const id = str(a.utmAdId) || str(a.adId) || str(a.ad_id);
    const name = str(a.utmContent) || str(a.adName) || str(a.ad_name);
    if (id) ids.push(id);
    if (name) names.push(name);
  }
  return { ids, names };
}

export function attributeLeads(opps: AttributableOpp[], ads: { adId: string; adName: string }[], since: string): AttributionResult {
  const adIds = new Set(ads.map((a) => a.adId));
  const idsByName = new Map<string, string[]>();
  for (const a of ads) {
    const key = a.adName.trim().toLowerCase();
    idsByName.set(key, [...(idsByName.get(key) ?? []), a.adId]);
  }

  const out: AttributionResult = { leadsByAd: new Map(), lastLeadByAd: new Map(), windowLeads: 0, viaId: 0, viaName: 0, unmatched: 0, none: 0 };
  for (const o of opps) {
    if (new Date(o.createdAt) < new Date(since)) continue;
    out.windowLeads++;
    const { ids, names } = adReferences(o);

    let adId = ids.find((id) => adIds.has(id));
    let how: 'id' | 'name' | null = adId ? 'id' : null;
    if (!adId) {
      for (const n of names) {
        const candidates = idsByName.get(n.toLowerCase());
        // Names aren't unique — the same creative is often reused across ad sets —
        // so a name is only trusted when it points at a single ad.
        if (candidates?.length === 1) { adId = candidates[0]; how = 'name'; break; }
      }
    }

    if (!adId) {
      if (ids.length || names.length) out.unmatched++; else out.none++;
      continue;
    }
    if (how === 'id') out.viaId++; else out.viaName++;
    out.leadsByAd.set(adId, (out.leadsByAd.get(adId) ?? 0) + 1);
    const prev = out.lastLeadByAd.get(adId);
    if (!prev || new Date(o.createdAt) > new Date(prev)) out.lastLeadByAd.set(adId, o.createdAt);
  }
  return out;
}

// Ad-level Meta stats, cached like the spend total (lib/metaCache.ts).
export async function getMetaAdLevel(client: Client, opts: { refresh?: boolean } = {}) {
  const { since, until } = metaWindow(client.start_date);
  const account = normalizeAdAccountId(client.meta_ad_account_id);
  return cachedMeta(`ads:${client.id}:${account}:${since}`, opts, () =>
    fetchMetaAdLevelStats(cleanMetaToken(client.meta_access_token), account, since, until)
  );
}

// Single source of truth for per-ad CPL + last-lead tracking — used by both
// the individual client dashboard and the admin Client Tracker overview.
export async function getClientAdPerformance(client: Client, agencyGhlKey: string, opts: { refresh?: boolean } = {}): Promise<ClientAdPerformance> {
  const { since } = metaWindow(client.start_date);

  let opps: AttributableOpp[] = [];
  if (client.ghl_location_id && client.ghl_pipeline_id) {
    const apiKey = resolveApiKey(client.ghl_api_key, agencyGhlKey);
    // No key at all would just be a guaranteed 401 — the reason for that is
    // reported by getLiveClientStats, so skip the doomed request here.
    if (apiKey) opps = await fetchGHLOpportunitiesRaw(apiKey, client.ghl_location_id, client.ghl_pipeline_id);
  }

  // Last lead across the whole pipeline, regardless of ad attribution or Meta connection.
  let lastLeadAt: string | null = null;
  for (const o of opps) {
    if (!lastLeadAt || new Date(o.createdAt) > new Date(lastLeadAt)) lastLeadAt = o.createdAt;
  }

  if (!client.meta_access_token || !client.meta_ad_account_id) {
    return { ads: [], bestCpl: null, lastLeadAt, metaError: null };
  }

  // lastLeadAt above comes purely from GHL, so a Meta failure must not take it
  // down with it — this used to throw out of the whole function, which blanked
  // the "Last Lead" column (and turned it red, reading as "no leads") every time
  // a Meta token expired. Best CPL is the only thing that genuinely needs Meta.
  let adStats: Awaited<ReturnType<typeof fetchMetaAdLevelStats>>;
  let metaError: string | null = null;
  try {
    const got = await getMetaAdLevel(client, opts);
    adStats = got.value;
    if (got.stale) metaError = `${got.error} Showing per-ad figures from ${ageLabel(got.fetchedAt)}.`;
  } catch (e) {
    return { ads: [], bestCpl: null, lastLeadAt, metaError: metaErrorMessage(e) };
  }

  const attribution = attributeLeads(opps, adStats, since);

  const ads: AdPerformanceRow[] = adStats
    .filter(a => a.spend > 0)
    .map(a => {
      const leads = attribution.leadsByAd.get(a.adId) ?? 0;
      return {
        adId: a.adId,
        adName: a.adName,
        spend: a.spend,
        leads,
        cpl: leads > 0 ? a.spend / leads : null,
        impressions: a.impressions,
        clicks: a.clicks,
        lastLeadAt: attribution.lastLeadByAd.get(a.adId) ?? null,
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

  return { ads, bestCpl, lastLeadAt, metaError };
}

import { fetchGHLOpportunitiesRaw, resolveApiKey } from './ghl';
import { cleanMetaToken, fetchMetaAdStats, fetchMetaAdLevelStats, metaErrorMessage, metaWindow, normalizeAdAccountId, recentWindow, zonedStartOfDay } from './meta';
import { ageLabel, cachedMeta } from './metaCache';
import { Client } from '@/types';

// Trailing windows (in days) the Client Tracker shows an overall CPL for.
const RECENT_WINDOWS = [3, 7] as const;

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

export interface RecentWindowStat {
  days: number;
  cpl: number | null; // overall (not per-ad) CPL over the trailing `days` days — null without spend or without leads
  leads: number; // leads in that same window, regardless of ad attribution
}

export interface ClientAdPerformance {
  ads: AdPerformanceRow[];
  bestCpl: number | null; // lowest CPL among ads that have at least one lead
  bestAdName: string | null; // the ad bestCpl belongs to
  lastLeadAt: string | null; // most recent lead across the WHOLE pipeline (not just ad-attributed)
  recent: RecentWindowStat[]; // one entry per RECENT_WINDOWS value, in order
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

// Account-level (not per-ad) spend for one trailing window, cached separately
// from the whole-campaign figures above since each has its own,
// much-shorter-lived window (the cache key includes `since`, so the 3-day and
// 7-day windows never share an entry).
async function getRecentSpend(client: Client, since: string, until: string, opts: { refresh?: boolean } = {}): Promise<number> {
  const account = normalizeAdAccountId(client.meta_ad_account_id);
  const got = await cachedMeta(`recent:${client.id}:${account}:${since}`, opts, () =>
    fetchMetaAdStats(cleanMetaToken(client.meta_access_token), account, undefined, { since, until })
  );
  return got.value.spend;
}

// Single source of truth for per-ad CPL + last-lead tracking — used by both
// the individual client dashboard and the admin Client Tracker overview.
export async function getClientAdPerformance(client: Client, agencyGhlKey: string, opts: { refresh?: boolean } = {}): Promise<ClientAdPerformance> {
  const { since } = metaWindow(client.start_date);
  // GHL's createdAt is a real UTC timestamp, so each recent-window boundary
  // needs an actual instant, not the LA-calendar-date string recentWindow
  // returns for Meta's own (timezone-agnostic) resolution — same reasoning as
  // metaHealth.ts's lead-tracking window. No per-account timezone is fetched
  // here (that's a whole extra Meta call for a short-window, non-billing
  // figure) — America/Los_Angeles is used directly, same upper-bound
  // assumption metaWindow itself already relies on.
  const windows = RECENT_WINDOWS.map((days) => {
    const w = recentWindow(days);
    return { days, since: w.since, until: w.until, sinceInstant: zonedStartOfDay(w.since, 'America/Los_Angeles') };
  });

  let opps: AttributableOpp[] = [];
  if (client.ghl_location_id && client.ghl_pipeline_id) {
    const apiKey = resolveApiKey(client.ghl_api_key, agencyGhlKey);
    // No key at all would just be a guaranteed 401 — the reason for that is
    // reported by getLiveClientStats, so skip the doomed request here.
    if (apiKey) opps = await fetchGHLOpportunitiesRaw(apiKey, client.ghl_location_id, client.ghl_pipeline_id);
  }

  // Last lead across the whole pipeline, regardless of ad attribution or Meta
  // connection, and how many leads fall in each trailing window (a lead from
  // the last 3 days is also in the last 7, so the windows nest).
  let lastLeadAt: string | null = null;
  const recentLeads = windows.map(() => 0);
  for (const o of opps) {
    const created = new Date(o.createdAt);
    if (!lastLeadAt || created > new Date(lastLeadAt)) lastLeadAt = o.createdAt;
    windows.forEach((w, i) => { if (created >= w.sinceInstant) recentLeads[i]++; });
  }
  const recentWithoutSpend: RecentWindowStat[] = windows.map((w, i) => ({ days: w.days, cpl: null, leads: recentLeads[i] }));

  if (!client.meta_access_token || !client.meta_ad_account_id) {
    return { ads: [], bestCpl: null, bestAdName: null, lastLeadAt, recent: recentWithoutSpend, metaError: null };
  }

  // lastLeadAt above comes purely from GHL, so a Meta failure must not take it
  // down with it — this used to throw out of the whole function, which blanked
  // the "Last Lead" column (and turned it red, reading as "no leads") every time
  // a Meta token expired. Best CPL is the only thing that genuinely needs Meta.
  let adStats: Awaited<ReturnType<typeof fetchMetaAdLevelStats>>;
  let metaError: string | null = null;
  let recentSpends: (number | null)[] = windows.map(() => null);
  try {
    // A failed recent-window spend call just leaves that window's CPL null —
    // only the main per-ad call failing is treated as a Meta error above.
    const [got, spends] = await Promise.all([
      getMetaAdLevel(client, opts),
      Promise.all(windows.map((w) => getRecentSpend(client, w.since, w.until, opts).catch(() => null))),
    ]);
    adStats = got.value;
    recentSpends = spends;
    if (got.stale) metaError = `${got.error} Showing per-ad figures from ${ageLabel(got.fetchedAt)}.`;
  } catch (e) {
    return { ads: [], bestCpl: null, bestAdName: null, lastLeadAt, recent: recentWithoutSpend, metaError: metaErrorMessage(e) };
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
  const bestAdName = ads.find(a => a.cpl != null)?.adName ?? null;
  const recent: RecentWindowStat[] = windows.map((w, i) => {
    const spend = recentSpends[i];
    return { days: w.days, cpl: spend != null && recentLeads[i] > 0 ? spend / recentLeads[i] : null, leads: recentLeads[i] };
  });

  return { ads, bestCpl, bestAdName, lastLeadAt, recent, metaError };
}

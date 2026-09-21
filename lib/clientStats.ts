import { getDb } from './db';
import { fetchGHLPipelineStats, resolveApiKey } from './ghl';
import { cleanMetaToken, fetchMetaAdStats, metaErrorMessage, metaWindow, normalizeAdAccountId, type MetaAdStats } from './meta';
import { ageLabel, cachedMeta, type Cached } from './metaCache';
import { Client } from '@/types';

// Where the ad-spend figure actually came from. Only 'meta' is a live number —
// 'manual' is a hand-entered total and 'estimate' is daily budget × days, both
// of which used to be shown identically to live data.
export type SpendSource = 'meta' | 'manual' | 'estimate';

export interface LiveClientStats {
  leads: number;
  inhome: number;
  contacted: number;
  phone: number;
  totalAdSpend: number;
  metaConnected: boolean; // the Meta call succeeded (even if it reported $0)
  hasMetaCredentials: boolean; // a token + ad account are saved for this client
  metaError: string | null; // credentials saved but the call failed (or only stale data is left) — why
  metaStale: boolean; // metaError is set but spend is still Meta's last real answer, from metaFetchedAt
  metaFetchedAt: number | null; // epoch ms of the Meta response the spend came from
  metaZeroSpend: boolean; // Meta answered fine and says nothing was spent in the window
  ghlError: string | null; // GHL is configured for this client but the pull failed — counts are the last saved ones
  spendSource: SpendSource;
}

// The one Meta spend figure per client, cached (lib/metaCache.ts). The tracker and
// the client's own dashboard both read it here, so the two can't show different
// numbers and opening either doesn't cost Meta a fresh call each time.
export async function getMetaSpend(client: Client, opts: { refresh?: boolean } = {}): Promise<Cached<MetaAdStats>> {
  const { since, until } = metaWindow(client.start_date);
  const account = normalizeAdAccountId(client.meta_ad_account_id);
  return cachedMeta(`stats:${client.id}:${account}:${since}`, opts, () =>
    fetchMetaAdStats(cleanMetaToken(client.meta_access_token), account, 'maximum', { since, until })
  );
}

// Single source of truth for "how much has this client actually spent on ads,
// and how many leads/in-homes do they have" — used by both the per-client
// dashboard and the admin Client Tracker overview so the two never disagree.
export async function getLiveClientStats(client: Client, agencyGhlKey: string, opts: { refresh?: boolean } = {}): Promise<LiveClientStats> {
  const daysTogether = Math.max(1, Math.floor((Date.now() - new Date(client.start_date).getTime()) / 86400000));

  let leads = 0;
  let inhome = 0;
  let contacted = 0;
  let phone = 0;
  let ghlError: string | null = null;
  if (client.ghl_location_id && client.ghl_pipeline_id) {
    try {
      const apiKey = resolveApiKey(client.ghl_api_key, agencyGhlKey);
      if (!apiKey) {
        throw new Error('No GoHighLevel API key is saved for this client and no agency key is set (Admin Settings > GHL Sync).');
      }
      // strict: a failed page must throw rather than quietly return a partial
      // (or empty) list — the counts get written to the cache below, so a
      // truncated fetch would overwrite good numbers with smaller ones.
      const pipeline = await fetchGHLPipelineStats(apiKey, client.ghl_location_id, client.ghl_pipeline_id, {
        leads: client.stage_leads ?? undefined,
        contacted: client.stage_contacted ?? undefined,
        unqualified: client.stage_unqualified ?? undefined,
        phone: client.stage_phone ?? undefined,
        inhome: client.stage_inhome ?? undefined,
      }, { strict: true });
      leads = pipeline.leads ?? 0;
      inhome = pipeline.inhome ?? 0;
      contacted = pipeline.contacted ?? 0;
      phone = pipeline.phone ?? 0;
    } catch (e: any) {
      // Fall back to the last cached counts below — but say so instead of
      // presenting them as current.
      ghlError = e?.message ?? String(e);
      console.error(`[ghl] ${client.name} (client #${client.id}): ${ghlError}`);
    }
  }
  if (leads === 0 && inhome === 0) {
    leads = client.cached_leads ?? 0;
    inhome = client.cached_inhome ?? 0;
  }

  let metaSpend: number | null = null;
  let metaError: string | null = null;
  let metaStale = false;
  let metaFetchedAt: number | null = null;
  const hasMetaCredentials = !!(client.meta_access_token && client.meta_ad_account_id);
  if (hasMetaCredentials) {
    try {
      const got = await getMetaSpend(client, opts);
      metaSpend = got.value.spend;
      metaFetchedAt = got.fetchedAt;
      if (got.stale) {
        // A refresh failed but there's a real earlier answer: show that, say so,
        // rather than dropping to a manual/estimated figure that looks live.
        metaStale = true;
        metaError = `${got.error} Showing the last figure Meta returned, from ${ageLabel(got.fetchedAt)}.`;
        console.error(`[meta] ${client.name} (client #${client.id}): ${got.error} — serving the figure from ${ageLabel(got.fetchedAt)}`);
      }
    } catch (e) {
      // Falls through to manual/estimate below — but not silently: the reason is
      // returned so the UI can say the number isn't live, and logged so it shows
      // up in the server logs too.
      metaError = metaErrorMessage(e);
      console.error(`[meta] ${client.name} (client #${client.id}): ${metaError}`);
    }
  }

  // Same priority as the per-client dashboard: live Meta > exact manual entry > daily-budget estimate
  let spendSource: SpendSource;
  let totalAdSpend: number;
  if (metaSpend != null && metaSpend > 0) {
    spendSource = 'meta';
    totalAdSpend = metaSpend;
  } else if ((client.ad_spend ?? 0) > 0) {
    spendSource = 'manual';
    totalAdSpend = client.ad_spend;
  } else {
    spendSource = 'estimate';
    totalAdSpend = (client.daily_ad_spend ?? 0) * daysTogether;
  }

  return { leads, inhome, contacted, phone, totalAdSpend, metaConnected: metaSpend != null, hasMetaCredentials, metaError, metaStale, metaFetchedAt, metaZeroSpend: metaSpend === 0, ghlError, spendSource };
}

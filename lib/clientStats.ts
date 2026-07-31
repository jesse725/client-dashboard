import { getDb } from './db';
import { fetchGHLPipelineStats, resolveApiKey } from './ghl';
import { fetchMetaAdStats } from './meta';
import { Client } from '@/types';

export interface LiveClientStats {
  leads: number;
  inhome: number;
  contacted: number;
  phone: number;
  totalAdSpend: number;
  metaConnected: boolean;
}

// Single source of truth for "how much has this client actually spent on ads,
// and how many leads/in-homes do they have" — used by both the per-client
// dashboard and the admin Client Tracker overview so the two never disagree.
export async function getLiveClientStats(client: Client, agencyGhlKey: string): Promise<LiveClientStats> {
  const daysTogether = Math.max(1, Math.floor((Date.now() - new Date(client.start_date).getTime()) / 86400000));

  let leads = 0;
  let inhome = 0;
  let contacted = 0;
  let phone = 0;
  if (client.ghl_location_id && client.ghl_pipeline_id) {
    try {
      const apiKey = resolveApiKey(client.ghl_api_key, agencyGhlKey);
      const pipeline = await fetchGHLPipelineStats(apiKey, client.ghl_location_id, client.ghl_pipeline_id, {
        leads: client.stage_leads ?? undefined,
        contacted: client.stage_contacted ?? undefined,
        unqualified: client.stage_unqualified ?? undefined,
        phone: client.stage_phone ?? undefined,
        inhome: client.stage_inhome ?? undefined,
      });
      leads = pipeline.leads ?? 0;
      inhome = pipeline.inhome ?? 0;
      contacted = pipeline.contacted ?? 0;
      phone = pipeline.phone ?? 0;
    } catch {
      // fall back to last cached counts below
    }
  }
  if (leads === 0 && inhome === 0) {
    leads = client.cached_leads ?? 0;
    inhome = client.cached_inhome ?? 0;
  }

  let metaSpend: number | null = null;
  if (client.meta_access_token && client.meta_ad_account_id) {
    try {
      const since = client.start_date;
      const until = new Date().toISOString().slice(0, 10);
      const stats = await fetchMetaAdStats(client.meta_access_token, client.meta_ad_account_id, 'maximum', { since, until });
      metaSpend = stats.spend;
    } catch {
      // fall through to manual/estimate below
    }
  }

  // Same priority as the per-client dashboard: live Meta > exact manual entry > daily-budget estimate
  const totalAdSpend =
    metaSpend != null && metaSpend > 0
      ? metaSpend
      : (client.ad_spend ?? 0) > 0
        ? client.ad_spend
        : (client.daily_ad_spend ?? 0) * daysTogether;

  return { leads, inhome, contacted, phone, totalAdSpend, metaConnected: metaSpend != null };
}

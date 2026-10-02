import {
  fetchGHLOpportunitiesRaw, fetchLocationPipelines, resolveApiKey,
  computeStageBreakdown, describeMissingGhlConfig,
} from './ghl';
import {
  cleanMetaToken, fetchMetaAdStats, normalizeAdAccountId,
  recentWindow, zonedStartOfDay,
} from './meta';
import { Client } from '@/types';

// "No Change / Monitoring" first — most client reviews land here, so it's
// the default instead of something requiring a scroll past rarer action
// types to reach every time.
export const ACTION_TYPES = [
  'No Change / Monitoring', 'Paused Ad', 'Launched Ads', 'New Creative Test', 'Targeting Change',
  'Campaign Structure Change', 'Offer / Copy Change', 'Scaling', 'Budget Change', 'Other',
] as const;

export const CAMPAIGN_HEALTH_VALUES = ['healthy', 'needs_attention', 'action_required'] as const;
export type CampaignHealth = typeof CAMPAIGN_HEALTH_VALUES[number];
export const CAMPAIGN_HEALTH_CONFIG: Record<CampaignHealth, { emoji: string; label: string; color: string }> = {
  healthy: { emoji: '🟢', label: 'Healthy', color: 'var(--green)' },
  needs_attention: { emoji: '🟡', label: 'Needs Attention', color: 'var(--yellow)' },
  action_required: { emoji: '🔴', label: 'Action Required', color: 'var(--red)' },
};

export const SNAPSHOT_WINDOWS = [3, 7, 30] as const;
export type SnapshotWindow = typeof SNAPSHOT_WINDOWS[number];

export interface MetricSnapshotRow {
  windowDays: SnapshotWindow;
  spend: number;
  leads: number;
  cpl: number | null;
  appointments: number;
  costPerAppointment: number | null;
  bookingRate: number | null; // appointments / leads * 100, same window
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
}

// Everything the Activity Log needs to freeze for one client, at the moment
// it's added to a log. Every number here is written ONCE to
// activity_log_metric_snapshots and never recomputed — this is the whole
// point of the feature (a log from a month ago must never silently change).
// A missing GHL/Meta connection produces nulls/zeros here rather than
// throwing, same as this app's existing "no data yet" convention
// (describeMissingGhlConfig, getClientAdPerformance) — a client without an
// integration can still be reviewed manually, just with blank metrics.
export async function captureClientSnapshot(client: Client, agencyGhlKey: string): Promise<MetricSnapshotRow[]> {
  const ghlConfigured = !describeMissingGhlConfig(client);
  const apiKey = ghlConfigured ? resolveApiKey(client.ghl_api_key, agencyGhlKey) : '';

  let opps: { pipelineStageId: string; createdAt: string }[] = [];
  let stages: { id: string; name: string; position: number }[] = [];
  if (ghlConfigured && apiKey) {
    try {
      const [rawOpps, pipelines] = await Promise.all([
        fetchGHLOpportunitiesRaw(apiKey, client.ghl_location_id!, client.ghl_pipeline_id!),
        fetchLocationPipelines(apiKey, client.ghl_location_id!),
      ]);
      opps = rawOpps;
      stages = pipelines.find((p) => p.id === client.ghl_pipeline_id)?.stages ?? [];
    } catch {
      // GHL down at the exact moment of snapshotting — leave opps/stages
      // empty rather than fail the whole add-client action; the buyer can
      // still write their observation manually for this one.
    }
  }

  const hasMeta = !!(client.meta_access_token && client.meta_ad_account_id);
  const account = hasMeta ? normalizeAdAccountId(client.meta_ad_account_id) : '';
  const token = hasMeta ? cleanMetaToken(client.meta_access_token) : '';

  return Promise.all(SNAPSHOT_WINDOWS.map(async (windowDays): Promise<MetricSnapshotRow> => {
    const { since, until } = recentWindow(windowDays);
    // GHL's createdAt is a real UTC timestamp — same zonedStartOfDay
    // reasoning as lib/adPerformance.ts's own recent-window figure.
    const sinceInstant = zonedStartOfDay(since, 'America/Los_Angeles');
    const windowedOpps = opps.filter((o) => new Date(o.createdAt) >= sinceInstant);

    const breakdown = computeStageBreakdown(windowedOpps, stages, {
      contacted: client.stage_contacted ?? undefined,
      unqualified: client.stage_unqualified ?? undefined,
      phone: client.stage_phone ?? undefined,
      inhome: client.stage_inhome ?? undefined,
    });
    const leads = breakdown.leads; // opportunities CREATED within this window
    const appointments = breakdown.phone; // of those, how many ever reached an appointment (cumulative — see lib/ghl.ts)

    let spend = 0, ctr: number | null = null, cpc: number | null = null, cpm: number | null = null, frequency: number | null = null;
    if (hasMeta) {
      try {
        const stats = await fetchMetaAdStats(token, account, undefined, { since, until });
        spend = stats.spend;
        ctr = stats.ctr || null;
        cpc = stats.cpc || null;
        frequency = stats.frequency || null;
        cpm = stats.impressions > 0 ? (stats.spend / stats.impressions) * 1000 : null;
      } catch {
        // This window's Meta call failed — spend/CTR/etc. stay null for it;
        // the GHL-derived lead/appointment counts above are unaffected.
      }
    }

    return {
      windowDays, spend, leads,
      cpl: leads > 0 ? spend / leads : null,
      appointments,
      costPerAppointment: appointments > 0 ? spend / appointments : null,
      bookingRate: leads > 0 ? (appointments / leads) * 100 : null,
      ctr, cpc, cpm, frequency,
    };
  }));
}

const DUE_WEEKDAYS = new Set(['Monday', 'Wednesday', 'Friday']);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Same America/Los_Angeles "what day is it" convention lib/meta.ts already
// established for every other date computation in this app.
export function todayInfo(now: Date = new Date()): { dateStr: string; dayOfWeek: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, dayOfWeek: get('weekday') };
}

// "Next Log Due" — today itself if today is a due day, otherwise the next
// one. A due-date INDICATOR, not an enforced block: the buyer can still
// create a log on any day (e.g. catching up after a missed Monday).
export function nextLogDueLabel(now: Date = new Date()): string {
  const { dayOfWeek } = todayInfo(now);
  if (DUE_WEEKDAYS.has(dayOfWeek)) return dayOfWeek;
  const todayIdx = WEEKDAYS.indexOf(dayOfWeek);
  for (let i = 1; i <= 7; i++) {
    const candidate = WEEKDAYS[(todayIdx + i) % 7];
    if (DUE_WEEKDAYS.has(candidate)) return candidate;
  }
  return dayOfWeek;
}

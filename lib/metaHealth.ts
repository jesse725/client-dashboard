import { getDb } from './db';
import { attributeLeads } from './adPerformance';
import { fetchAllOpportunitiesRaw, resolveApiKey } from './ghl';
import {
  cleanMetaToken, fetchMetaAccountInfo, fetchMetaAdLevelStats, fetchMetaDailyInsights, fetchMetaGrantedPermissions,
  fetchMetaTokenInfo, looksLikeAdAccountId, metaErrorMessage, metaWindow, normalizeAdAccountId, MetaApiError,
  type MetaAccountInfo, type MetaTokenInfo,
} from './meta';
import { Client } from '@/types';

// "Is this Meta connection actually healthy, and are the leads it produces
// reaching us?" Until now a token was saved without ever being tried, "Connected"
// only meant "something is saved", and the only way to learn a connection had
// died was to notice the numbers were wrong. This runs the whole chain and says
// specifically what's wrong and how to fix it.
//
// Nothing in a result ever contains the access token.

export type IssueLevel = 'error' | 'warn' | 'info' | 'ok';
export interface MetaIssue { level: IssueLevel; message: string; fix?: string }

export interface LeadReconciliation {
  newLeads: number; // GoHighLevel opportunities created in the same 30 days Meta reports on
  totalLeads: number; // every opportunity in the pipeline
  byStatus: Record<string, number>; // of the new ones: open / won / lost / abandoned
  attribution: { viaId: number; viaName: number; unmatched: number; none: number } | null; // null when Meta's ad list wasn't available
  attributionFieldsSeen: string[]; // the field names GoHighLevel actually sends, to see what's there
  error: string | null; // the GoHighLevel pull failed, so nothing could be compared
}

export interface MetaCheck {
  checkedAt: string;
  connected: boolean; // token accepted AND the ad account readable
  account: MetaAccountInfo | null;
  token: { valid: boolean | null; neverExpires: boolean | null; expiresAt: string | null; daysLeft: number | null; type: string | null; scopes: string[] | null };
  delivery: { spend7d: number; spend30d: number; lastSpendDate: string | null } | null;
  metaLeads: { last7d: number; last30d: number } | null; // as Meta counts them
  leadTracking: LeadReconciliation | null; // only for a client with GoHighLevel set up
  issues: MetaIssue[];
}

const FIX_NEW_TOKEN =
  'Create a System User token: Meta Business Settings → Users → System users → add one and assign this ad account to it ("View performance" is enough), then Generate token — pick your app (a Business-type app from developers.facebook.com added to the Business), tick ads_read, and set expiry to Never. Paste it under Edit Client. It never expires like a personal login token does, and one System User can cover every client whose ad account is shared with your Business.';
const FIX_ADS_URL_PARAMS =
  'On each ad (Ads Manager → the ad → Tracking → URL parameters) add: utm_source=fb_ad&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}} — GoHighLevel\'s recommended setup. The lead form has to be on the landing page the ad opens; if visitors click through to another page first, the ad information is lost.';

const DAY = 86400000;
const daysBetween = (isoDate: string, from: Date) => Math.floor((from.getTime() - new Date(`${isoDate}T00:00:00Z`).getTime()) / DAY);

// ── Meta side ───────────────────────────────────────────────────────────────
export async function checkMetaConnection(rawToken: string, rawAccount: string): Promise<MetaCheck> {
  const token = cleanMetaToken(rawToken);
  const accountId = normalizeAdAccountId(rawAccount);
  const now = new Date();
  const check: MetaCheck = {
    checkedAt: now.toISOString(), connected: false, account: null,
    token: { valid: null, neverExpires: null, expiresAt: null, daysLeft: null, type: null, scopes: null },
    delivery: null, metaLeads: null, leadTracking: null, issues: [],
  };
  const issue = (level: IssueLevel, message: string, fix?: string) => check.issues.push({ level, message, ...(fix ? { fix } : {}) });

  if (!token) { issue('error', 'No access token is saved.', FIX_NEW_TOKEN); return check; }
  if (!looksLikeAdAccountId(accountId)) {
    issue('error', `The ad account ID "${rawAccount.trim()}" doesn't look right — it should be "act_" followed by digits.`,
      'Copy it from Meta Business Settings → Accounts → Ad accounts (the number under the account name), or from the Ads Manager URL (asset_id=…).');
    return check;
  }

  // 1. Is the token good, what can it do, and when does it stop working?
  let info: MetaTokenInfo | null = null;
  try {
    info = await fetchMetaTokenInfo(token);
  } catch (e) {
    if (e instanceof MetaApiError && e.code === 190) {
      check.token.valid = false;
      issue('error', metaErrorMessage(e), FIX_NEW_TOKEN);
      return check; // every other call would fail the same way
    }
    // The debugger can refuse a token that's otherwise fine — expiry is then just unknown.
    issue('info', 'Meta wouldn\'t tell us when this token expires, so a coming expiry can\'t be warned about in advance.');
  }
  if (info) {
    check.token.valid = info.valid;
    check.token.neverExpires = info.neverExpires;
    check.token.expiresAt = info.expiresAt;
    check.token.type = info.type;
    if (info.scopes.length) check.token.scopes = info.scopes;
    if (!info.valid) { issue('error', 'Meta says this token is no longer valid.', FIX_NEW_TOKEN); return check; }
    if (info.expiresAt) {
      const daysLeft = Math.ceil((new Date(info.expiresAt).getTime() - now.getTime()) / DAY);
      check.token.daysLeft = daysLeft;
      if (daysLeft <= 14) {
        issue('warn', `This token expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'} (${info.expiresAt.slice(0, 10)}). Spend and leads stop syncing the day it does.`, FIX_NEW_TOKEN);
      } else {
        issue('info', `This is a personal login token, valid for ${daysLeft} more days (until ${info.expiresAt.slice(0, 10)}). It will stop working then — and sooner if its owner changes their password or loses access to the ad account.`,
          'A System User token doesn\'t expire. ' + FIX_NEW_TOKEN);
      }
    } else if (info.neverExpires) {
      issue('ok', 'The token doesn\'t expire.');
    }
  }
  if (!check.token.scopes) {
    try { check.token.scopes = await fetchMetaGrantedPermissions(token); } catch { /* unknown is fine */ }
  }
  if (check.token.scopes && !check.token.scopes.some((s) => s === 'ads_read' || s === 'ads_management')) {
    issue('error', `The token can't read ad data — it only has: ${check.token.scopes.join(', ') || 'no permissions'}.`,
      'Generate the token again with the ads_read permission ticked.');
    return check;
  }

  // 2. Can it see this ad account, and is the account in a state where ads run?
  try {
    check.account = await fetchMetaAccountInfo(token, accountId);
  } catch (e) {
    const denied = e instanceof MetaApiError && (e.code === 100 || e.code === 10 || (e.code != null && e.code >= 200 && e.code <= 299));
    issue('error', metaErrorMessage(e), denied
      ? 'The person or System User that made the token has to be given access to this ad account in Meta Business Settings (Accounts → Ad accounts → select it → add them, with "View performance"). If the client owns the account, they need to share it with your Business first (Business Settings → Partners).'
      : undefined);
    return check;
  }
  check.connected = true;
  const a = check.account;
  if (a.statusCode !== 1 && a.statusCode !== 201) {
    issue('error', `The ad account is "${a.status}"${a.disableReason ? ` (disable reason code ${a.disableReason})` : ''} — ads don't deliver while it is, so no new leads will come in.`,
      'Open the account in Meta Ads Manager (Billing and Account Quality) to see what it needs — usually a failed payment or a policy review.');
  }
  if (a.currency && a.currency !== 'USD') issue('info', `The ad account reports spend in ${a.currency}, not USD — the dashboard shows the number as-is.`);

  // 3. Is it actually delivering, and how many leads does Meta itself count?
  let rows: Awaited<ReturnType<typeof fetchMetaDailyInsights>> = [];
  try {
    rows = await fetchMetaDailyInsights(token, accountId, 'last_30d');
  } catch (e) {
    issue('warn', `Couldn't read the last 30 days of results — ${metaErrorMessage(e)}`);
    return check;
  }
  const { until } = metaWindow(null, now);
  const spend = (r: { spend: number }) => r.spend;
  const in7d = rows.filter((r) => daysBetween(r.date, new Date(`${until}T00:00:00Z`)) <= 7);
  const spend30d = rows.reduce((t, r) => t + spend(r), 0);
  const spend7d = in7d.reduce((t, r) => t + spend(r), 0);
  const lastSpend = rows.filter((r) => r.spend > 0).map((r) => r.date).sort().pop() ?? null;
  check.delivery = { spend7d, spend30d, lastSpendDate: lastSpend };
  check.metaLeads = { last7d: in7d.reduce((t, r) => t + r.leads, 0), last30d: rows.reduce((t, r) => t + r.leads, 0) };

  if (spend30d === 0) {
    issue('warn', 'No ad spend in the last 30 days — the ads are paused, out of budget, or blocked by a billing problem, or this is the wrong ad account.',
      'Check Ads Manager for paused campaigns or a payment problem, and confirm this ad account ID belongs to this client.');
  } else if (spend7d === 0) {
    issue('warn', `No ad spend in the last 7 days (last spend was ${lastSpend}) — the ads stopped delivering, so leads will dry up.`,
      'Check Ads Manager for paused campaigns, an exhausted budget, or a payment problem.');
  } else {
    issue('ok', `Ads are delivering — $${Math.round(spend7d).toLocaleString()} in the last 7 days, $${Math.round(spend30d).toLocaleString()} in 30.`);
  }
  return check;
}

// ── Lead tracking: does what Meta delivered match what reached GoHighLevel? ─────
export async function checkLeadTracking(client: Client, agencyKey: string, check: MetaCheck): Promise<void> {
  if (!client.ghl_location_id || !client.ghl_pipeline_id) return;
  const issue = (level: IssueLevel, message: string, fix?: string) => check.issues.push({ level, message, ...(fix ? { fix } : {}) });

  const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);
  const empty: LeadReconciliation = { newLeads: 0, totalLeads: 0, byStatus: {}, attribution: null, attributionFieldsSeen: [], error: null };
  if (!apiKey) {
    check.leadTracking = { ...empty, error: 'No GoHighLevel API key is saved for this client and no agency key is set.' };
    issue('error', check.leadTracking.error!, 'Add the agency key under Admin Settings → GHL Sync.');
    return;
  }

  let opps: any[];
  try {
    opps = await fetchAllOpportunitiesRaw(apiKey, client.ghl_location_id, client.ghl_pipeline_id, { strict: true });
  } catch (e: any) {
    check.leadTracking = { ...empty, error: e?.message ?? String(e) };
    issue('error', `Couldn't read leads from GoHighLevel, so they can't be compared with Meta's — ${check.leadTracking.error}`);
    return;
  }

  // Meta's last_30d is the 30 days ending yesterday (account timezone): compare like with like.
  const { until } = metaWindow(null);
  const end = new Date(`${until}T00:00:00Z`);
  const from = new Date(end.getTime() - 30 * DAY);
  const windowOpps = opps.filter((o) => { const t = new Date(o.createdAt).getTime(); return t >= from.getTime() && t < end.getTime(); });
  const byStatus: Record<string, number> = {};
  for (const o of windowOpps) byStatus[o.status ?? 'unknown'] = (byStatus[o.status ?? 'unknown'] ?? 0) + 1;

  const fields = new Set<string>();
  for (const o of opps) for (const a of o.attributions ?? []) for (const k of Object.keys(a ?? {})) fields.add(k);

  // Ad spend is counted from the client's Start Date, but Leads (and so cost-per-lead) counts every
  // opportunity ever in the pipeline — leads from before that date inflate the lead count while
  // their ad spend isn't in the spend figure, which makes cost-per-lead look better than it is.
  const startMs = new Date(client.start_date).getTime();
  const created = opps.map((o) => new Date(o.createdAt).getTime()).filter((t) => Number.isFinite(t));
  const predating = Number.isFinite(startMs) ? created.filter((t) => t < startMs).length : 0;
  if (predating > 0 && created.length) {
    const share = predating / created.length;
    issue(share >= 0.25 ? 'warn' : 'info',
      `${predating} of the ${created.length} leads in this pipeline were created before the client's Start Date (${client.start_date.slice(0, 10)}; the earliest is ${new Date(Math.min(...created)).toISOString().slice(0, 10)}). They're counted in Leads, but ad spend is only counted from the Start Date — so cost-per-lead looks lower than it really is.`,
      'Set the Start Date (Edit Client) to when this client\'s ads actually began, so spend and leads cover the same period.');
  }

  let attribution: LeadReconciliation['attribution'] = null;
  if (check.connected) {
    try {
      const ads = await fetchMetaAdLevelStats(cleanMetaToken(client.meta_access_token), normalizeAdAccountId(client.meta_ad_account_id), from.toISOString().slice(0, 10), new Date(end.getTime() - DAY).toISOString().slice(0, 10));
      const r = attributeLeads(windowOpps, ads, from.toISOString());
      attribution = { viaId: r.viaId, viaName: r.viaName, unmatched: r.unmatched, none: r.none };
    } catch { /* the ad list is only needed for the attribution breakdown */ }
  }
  const rec: LeadReconciliation = { newLeads: windowOpps.length, totalLeads: opps.length, byStatus, attribution, attributionFieldsSeen: [...fields].sort(), error: null };
  check.leadTracking = rec;

  if (!check.connected || !check.delivery || !check.metaLeads) return;
  const M = check.metaLeads.last30d;
  const G = rec.newLeads;
  const spend30d = check.delivery.spend30d;

  if (spend30d === 0) {
    // Nothing ran in this ad account, so there's nothing for Meta's count to be compared with.
    if (G > 0) issue('info', `GoHighLevel received ${G} new leads in the last 30 days even though this ad account shows no spend — they're coming from somewhere other than these ads (or from a different ad account).`);
  } else if (M === 0) {
    issue('warn', `Meta has recorded 0 leads for $${Math.round(spend30d).toLocaleString()} of spend in the last 30 days${G ? ` (GoHighLevel did receive ${G} new leads in that time)` : ''}. If these ads are meant to generate leads, Meta isn't seeing them — so it can't find more people like them.`,
      'Check the Meta Pixel / Conversions API fires a Lead event when the form is submitted (or that the campaign uses a Meta Instant Form), and that the campaign objective is Leads.');
  } else if (M >= 5 && G < 0.7 * M) {
    issue('error', `Meta counted ${M} leads in the last 30 days but only ${G} new leads reached GoHighLevel — roughly ${M - G} are getting lost on the way in.`,
      'In GoHighLevel open Settings → Integrations → Facebook and reconnect it if it shows expired; make sure every lead form is mapped to a workflow that creates an opportunity in this pipeline; and look for contacts that arrived without an opportunity.');
  } else if (G >= 5 && G > 1.5 * M) {
    issue('info', `GoHighLevel has ${G} new leads in 30 days against ${M} counted by Meta — some come from other sources or aren't reported back to Meta, so Meta can only learn from part of them.`);
  } else {
    const close = M >= 5 && G >= 0.85 * M && G <= 1.2 * M;
    issue(close ? 'ok' : 'info', close
      ? `Lead counts line up: Meta ${M}, GoHighLevel ${G} over the last 30 days.`
      : `Meta counted ${M} lead${M === 1 ? '' : 's'} and GoHighLevel received ${G} over the last 30 days${M < 5 && G < 5
          ? ' — too few to compare reliably.'
          : ' — a modest gap, usually other lead sources or the way Meta credits leads to ads.'}`);
  }

  if (attribution && G >= 5) {
    const tied = attribution.viaId + attribution.viaName;
    if (tied / G < 0.5) {
      issue('warn', `Only ${tied} of ${G} new leads can be tied to a specific ad (${attribution.none} carry no ad information, ${attribution.unmatched} name an ad Meta doesn't recognise, or one that several ads share), so per-ad cost-per-lead and "Best Ad CPL" are incomplete.`, FIX_ADS_URL_PARAMS);
    } else if (attribution.viaName > 0 && attribution.viaId === 0) {
      issue('info', `${tied} of ${G} new leads were tied to an ad by its name (the ad ID isn't being sent). That works, but ads that share a name can't be told apart.`);
    }
  }
}

// ── Saved results, so the Meta Health view has something to show before a re-check ──
export function saveCheck(key: 'sales' | number, result: MetaCheck) {
  getDb().prepare(`
    INSERT INTO meta_cache (key, payload, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at
  `).run(`check:${key}`, JSON.stringify(result), Date.now());
}

export function loadChecks(): { clients: Record<number, MetaCheck>; sales: MetaCheck | null } {
  const rows = getDb().prepare("SELECT key, payload FROM meta_cache WHERE key LIKE 'check:%'").all() as { key: string; payload: string }[];
  const clients: Record<number, MetaCheck> = {};
  let sales: MetaCheck | null = null;
  for (const r of rows) {
    const id = r.key.slice('check:'.length);
    try {
      const parsed = JSON.parse(r.payload) as MetaCheck;
      if (id === 'sales') sales = parsed; else clients[Number(id)] = parsed;
    } catch { /* an unreadable saved result is just not shown */ }
  }
  return { clients, sales };
}

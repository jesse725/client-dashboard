// Meta retires each Graph/Marketing API version roughly two years after release
// (v19.0 — what this used to pin — expired 2026-05-21; see the version table at
// developers.facebook.com/docs/graph-api/changelog/versions). Meta's policy is
// that calls to an expired version "may fail or be upgraded", so a stale pin is
// a silent-breakage risk. Pinned to a supported version and overridable via
// META_GRAPH_VERSION so the next bump doesn't need a code change.
const META_VERSION = process.env.META_GRAPH_VERSION?.trim() || 'v25.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

// ── Errors ───────────────────────────────────────────────────────────────────
// Every Meta consumer used to `catch {}` and quietly fall back to a manual or
// estimated number, so an expired token looked identical to "no data". These
// turn Meta's terse error JSON into something a human can act on. Nothing here
// ever includes the access token (Meta's error bodies don't echo it, and the
// snippet is scrubbed anyway as a belt-and-braces measure).
export class MetaApiError extends Error {
  constructor(message: string, public status: number, public code?: number, public subcode?: number) {
    super(message);
    this.name = 'MetaApiError';
  }
}

function scrub(text: string): string {
  return text
    .replace(/EAA[A-Za-z0-9]{20,}/g, '[token]')
    .replace(/access_token=[^&\s"]+/gi, 'access_token=[token]');
}

function friendlyMetaMessage(status: number, code?: number, subcode?: number, detail = ''): string {
  if (code === 190) {
    return subcode === 463 || /expired/i.test(detail)
      ? 'The Meta access token has expired — generate a new one and paste it in (Edit Client).'
      : 'The Meta access token is invalid or was revoked — generate a new one and paste it in (Edit Client).';
  }
  if (code === 2635) return 'The Meta API version this app calls has been retired — set META_GRAPH_VERSION to a current version.';
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code != null && code >= 80000 && code <= 80014)) {
    return 'Meta is rate-limiting requests right now — this usually clears within a few minutes.';
  }
  if (code === 10 || (code != null && code >= 200 && code <= 299)) {
    return "The token doesn't have permission to read this ad account (it needs ads_read and access to the account).";
  }
  if (code === 100) return 'Meta could not find that ad account, or the token cannot see it — check the ad account ID.';
  return `Meta returned an error (${code != null ? `code ${code}` : `HTTP ${status}`}).`;
}

async function metaErrorFrom(res: Response): Promise<MetaApiError> {
  let raw = '';
  try { raw = await res.text(); } catch { /* unreadable body — status alone will do */ }
  let code: number | undefined;
  let subcode: number | undefined;
  let detail = raw;
  try {
    const j = JSON.parse(raw);
    code = j?.error?.code;
    subcode = j?.error?.error_subcode;
    detail = j?.error?.error_user_msg || j?.error?.message || raw;
  } catch { /* not JSON */ }
  detail = scrub(String(detail)).slice(0, 200);
  const friendly = friendlyMetaMessage(res.status, code, subcode, detail);
  return new MetaApiError(detail ? `${friendly} (Meta said: "${detail}")` : friendly, res.status, code, subcode);
}

// Normalises anything thrown by the fetchers below into one readable line, for
// consumers that record "why didn't this sync" rather than re-throwing.
export function metaErrorMessage(e: unknown): string {
  if (e instanceof MetaApiError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  return `Couldn't reach Meta: ${scrub(msg).slice(0, 160)}`;
}

// ── Inputs ───────────────────────────────────────────────────────────────────
// Tokens and account IDs are pasted in by hand. A stray space or line break from
// the copy (or a "Bearer " prefix) is enough for Meta to answer "invalid token",
// and it looks exactly like an expired one — so clean them where they're used.
export function cleanMetaToken(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^bearer\s+/i, '').replace(/^["']+|["']+$/g, '').replace(/\s+/g, '');
}

// "act_123", "123", " ACT_123 " and "123-456-789" all mean the same account.
export function normalizeAdAccountId(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  const digits = text.replace(/^act[_\s-]*/i, '').replace(/\D/g, '');
  return digits ? `act_${digits}` : text;
}

export function looksLikeAdAccountId(id: string): boolean {
  return /^act_\d{5,20}$/.test(id);
}

// ── Date window ─────────────────────────────────────────────────────────────
// Meta reports in the ad account's own timezone, so "today" taken from UTC is
// already tomorrow for a US account in the evening. Los Angeles' date is never
// ahead of any US account's, so it's the safe upper bound. Insights also only
// reach back 37 months (an older `since` is an error, not a shorter answer), so
// a long-standing client's start date is clamped to 36.
export function metaWindow(startDate: string | null | undefined, now: Date = new Date()): { since: string; until: string; clamped: boolean } {
  const until = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  let since = /^\d{4}-\d{2}-\d{2}/.test(startDate ?? '') ? (startDate as string).slice(0, 10) : until;
  const floor = new Date(`${until}T00:00:00Z`);
  floor.setUTCMonth(floor.getUTCMonth() - 36);
  const floorStr = floor.toISOString().slice(0, 10);
  let clamped = false;
  if (since < floorStr) { since = floorStr; clamped = true; }
  if (since > until) since = until; // a start date still in the future
  return { since, until, clamped };
}

// ── Requests ────────────────────────────────────────────────────────────────
// Nothing here used to time out, so one hung Meta call would hang the whole
// Client Success load (every client is fetched in parallel).
const REQUEST_TIMEOUT_MS = 20_000;

async function metaFetch(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw await metaErrorFrom(res);
    return await res.json();
  } catch (e: any) {
    if (e instanceof MetaApiError) throw e;
    if (e?.name === 'AbortError') throw new Error(`Meta didn't answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function metaUrl(path: string, token: string, params: Record<string, string> = {}): string {
  return `${META_BASE}/${path}?${new URLSearchParams({ ...params, access_token: cleanMetaToken(token) })}`;
}

export interface MetaAdStats {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;   // percentage, e.g. 2.5
  cpc: number;
  reach: number;
  frequency: number;
}

export async function fetchMetaAdStats(
  accessToken: string,
  adAccountId: string, // act_XXXXXXXXXX, or just the number
  datePreset: string = 'maximum',
  range?: { since: string; until: string } // overrides datePreset when provided (YYYY-MM-DD, inclusive)
): Promise<MetaAdStats> {
  const params: Record<string, string> = { fields: 'spend,impressions,clicks,ctr,cpc,reach,frequency' };
  if (range) params.time_range = JSON.stringify(range);
  else params.date_preset = datePreset;

  const json = await metaFetch(metaUrl(`${normalizeAdAccountId(adAccountId)}/insights`, accessToken, params));
  const d = json.data?.[0];

  if (!d) {
    return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, reach: 0, frequency: 0 };
  }

  return {
    spend: parseFloat(d.spend ?? '0'),
    impressions: parseInt(d.impressions ?? '0', 10),
    clicks: parseInt(d.clicks ?? '0', 10),
    ctr: parseFloat(d.ctr ?? '0'),
    cpc: parseFloat(d.cpc ?? '0'),
    reach: parseInt(d.reach ?? '0', 10),
    frequency: parseFloat(d.frequency ?? '0'),
  };
}

export interface MetaAdLevelStat {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
}

// Per-ad breakdown (level=ad) for a date range — used to join against GHL's
// per-lead ad attribution to compute true cost-per-lead per creative.
export async function fetchMetaAdLevelStats(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<MetaAdLevelStat[]> {
  const results: MetaAdLevelStat[] = [];
  let url = metaUrl(`${normalizeAdAccountId(adAccountId)}/insights`, accessToken, {
    level: 'ad', fields: 'ad_id,ad_name,spend,impressions,clicks', time_range: JSON.stringify({ since, until }), limit: '200',
  });

  while (url) {
    const json = await metaFetch(url);
    for (const d of json.data ?? []) {
      results.push({
        adId: d.ad_id,
        adName: d.ad_name ?? d.ad_id,
        spend: parseFloat(d.spend ?? '0'),
        impressions: parseInt(d.impressions ?? '0', 10),
        clicks: parseInt(d.clicks ?? '0', 10),
      });
    }
    url = json.paging?.next ?? '';
  }

  return results;
}

// since/until in YYYY-MM-DD, inclusive
export async function fetchMetaAdSpendRange(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<number> {
  const json = await metaFetch(metaUrl(`${normalizeAdAccountId(adAccountId)}/insights`, accessToken, {
    fields: 'spend', time_range: JSON.stringify({ since, until }),
  }));
  return parseFloat(json.data?.[0]?.spend ?? '0');
}

// One request per page for a whole range, broken into calendar-month buckets
// via time_increment=monthly — avoids N separate calls for an N-month trend.
// Paginates like fetchMetaAdLevelStats does — a range long enough to span
// many months could otherwise silently lose the later ones past page 1.
export async function fetchMetaSpendByMonth(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<{ month: string; spend: number }[]> {
  const results: { month: string; spend: number }[] = [];
  let url = metaUrl(`${normalizeAdAccountId(adAccountId)}/insights`, accessToken, {
    fields: 'spend', time_range: JSON.stringify({ since, until }), time_increment: 'monthly', limit: '200',
  });

  while (url) {
    const json = await metaFetch(url);
    for (const d of json.data ?? []) {
      results.push({ month: String(d.date_start).slice(0, 7), spend: parseFloat(d.spend ?? '0') });
    }
    url = json.paging?.next ?? '';
  }

  return results;
}

// ── Connection diagnostics ──────────────────────────────────────────────────
// Everything below backs the "is this connection actually healthy" check
// (lib/metaHealth.ts) — until now nothing ever verified a saved token.

export interface MetaTokenInfo {
  valid: boolean;
  neverExpires: boolean;
  expiresAt: string | null; // ISO; null when it never expires or Meta didn't say
  scopes: string[];
  type: string | null; // e.g. USER, SYSTEM_USER
}

// Meta's token debugger. Normally called with an app token; a token can usually
// inspect itself, which is all that's available here — callers treat a failure as
// "expiry unknown", not as a broken connection.
export async function fetchMetaTokenInfo(token: string): Promise<MetaTokenInfo> {
  const t = cleanMetaToken(token);
  const json = await metaFetch(`${META_BASE}/debug_token?${new URLSearchParams({ input_token: t, access_token: t })}`);
  const d = json.data ?? {};
  const expires = typeof d.expires_at === 'number' ? d.expires_at : null;
  return {
    valid: d.is_valid !== false,
    neverExpires: expires === 0,
    expiresAt: expires && expires > 0 ? new Date(expires * 1000).toISOString() : null,
    scopes: Array.isArray(d.scopes) ? d.scopes.map(String) : [],
    type: d.type ? String(d.type) : null,
  };
}

export async function fetchMetaGrantedPermissions(token: string): Promise<string[]> {
  const json = await metaFetch(metaUrl('me/permissions', token));
  return (json.data ?? []).filter((p: any) => p.status === 'granted').map((p: any) => String(p.permission));
}

// account_status values, from Meta's Ad Account reference.
const ACCOUNT_STATUS: Record<number, string> = {
  1: 'Active', 2: 'Disabled', 3: 'Payment problem (unsettled)', 7: 'Pending risk review', 8: 'Pending payment settlement',
  9: 'In payment grace period', 100: 'Pending closure', 101: 'Closed', 201: 'Active', 202: 'Closed',
};

export interface MetaAccountInfo {
  id: string;
  name: string | null;
  statusCode: number | null;
  status: string;
  disableReason: number | null; // 0/null when not disabled
  currency: string | null;
  timezone: string | null;
}

export async function fetchMetaAccountInfo(token: string, adAccountId: string): Promise<MetaAccountInfo> {
  const id = normalizeAdAccountId(adAccountId);
  const d = await metaFetch(metaUrl(id, token, { fields: 'name,account_status,disable_reason,currency,timezone_name' }));
  const code = typeof d.account_status === 'number' ? d.account_status : null;
  return {
    id,
    name: d.name ?? null,
    statusCode: code,
    status: code != null ? (ACCOUNT_STATUS[code] ?? `Status ${code}`) : 'Unknown',
    disableReason: typeof d.disable_reason === 'number' ? d.disable_reason : null,
    currency: d.currency ?? null,
    timezone: d.timezone_name ?? null,
  };
}

// `lead` is Meta's own total of on-Facebook (instant form) and website (pixel)
// leads, so adding the specific types to it would count everything twice; they're
// only used when `lead` isn't reported.
export function metaLeadsFromActions(actions: { action_type: string; value: string }[] | undefined): number {
  if (!actions?.length) return 0;
  const by = new Map(actions.map((a) => [a.action_type, parseFloat(a.value) || 0]));
  if (by.has('lead')) return by.get('lead')!;
  const onFacebook = by.get('onsite_conversion.lead_grouped') ?? by.get('leadgen_grouped') ?? 0;
  return onFacebook + (by.get('offsite_conversion.fb_pixel_lead') ?? 0);
}

export interface MetaDailyRow {
  date: string; // YYYY-MM-DD, in the ad account's timezone
  spend: number;
  impressions: number;
  clicks: number;
  leads: number; // as Meta counts them
}

// One row per day. Gives delivery (is it spending, and when did it last), and Meta's
// own lead count, from a single request.
export async function fetchMetaDailyInsights(token: string, adAccountId: string, datePreset: string = 'last_30d'): Promise<MetaDailyRow[]> {
  const rows: MetaDailyRow[] = [];
  let url = metaUrl(`${normalizeAdAccountId(adAccountId)}/insights`, token, {
    fields: 'spend,impressions,clicks,actions', date_preset: datePreset, time_increment: '1', limit: '100',
  });
  while (url) {
    const json = await metaFetch(url);
    for (const d of json.data ?? []) {
      rows.push({
        date: String(d.date_start),
        spend: parseFloat(d.spend ?? '0'),
        impressions: parseInt(d.impressions ?? '0', 10),
        clicks: parseInt(d.clicks ?? '0', 10),
        leads: metaLeadsFromActions(d.actions),
      });
    }
    url = json.paging?.next ?? '';
  }
  return rows;
}

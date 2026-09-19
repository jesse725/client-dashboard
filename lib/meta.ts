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
  adAccountId: string, // format: act_XXXXXXXXXX
  datePreset: string = 'maximum',
  range?: { since: string; until: string } // overrides datePreset when provided (YYYY-MM-DD, inclusive)
): Promise<MetaAdStats> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'spend,impressions,clicks,ctr,cpc,reach,frequency';
  const dateParam = range
    ? `time_range=${encodeURIComponent(JSON.stringify(range))}`
    : `date_preset=${datePreset}`;
  const url = `${META_BASE}/${account}/insights?fields=${fields}&${dateParam}&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) throw await metaErrorFrom(res);

  const json = await res.json();
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
// per-lead ad attribution (utmAdId) to compute true cost-per-lead per creative.
export async function fetchMetaAdLevelStats(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<MetaAdLevelStat[]> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const fields = 'ad_id,ad_name,spend,impressions,clicks';
  const results: MetaAdLevelStat[] = [];
  let url = `${META_BASE}/${account}/insights?level=ad&fields=${fields}&time_range=${timeRange}&limit=200&access_token=${accessToken}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw await metaErrorFrom(res);
    const json = await res.json();
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
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${META_BASE}/${account}/insights?fields=spend&time_range=${timeRange}&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) throw await metaErrorFrom(res);
  const json = await res.json();
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
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const results: { month: string; spend: number }[] = [];
  let url = `${META_BASE}/${account}/insights?fields=spend&time_range=${timeRange}&time_increment=monthly&limit=200&access_token=${accessToken}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw await metaErrorFrom(res);
    const json = await res.json();
    for (const d of json.data ?? []) {
      results.push({ month: String(d.date_start).slice(0, 7), spend: parseFloat(d.spend ?? '0') });
    }
    url = json.paging?.next ?? '';
  }

  return results;
}

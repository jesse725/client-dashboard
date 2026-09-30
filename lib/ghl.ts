import { PipelineStats } from '@/types';

// GHL v2 API (supports pit-... Private Integration Tokens)
const GHL_V2 = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

function v2Headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
  };
}

export interface GHLLocation {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  logoUrl?: string;
  timezone?: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: GHLStage[];
}

export interface GHLStage {
  id: string;
  name: string;
  position: number;
}

export interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
}

interface GHLOpportunity {
  id: string;
  pipelineStageId: string;
  status: string;
}

// ── Agency-level: list all sub-accounts ─────────────────────────────────────
export async function fetchAgencyLocations(agencyApiKey: string): Promise<GHLLocation[]> {
  // v2: requires companyId. We get it by fetching the token info first.
  const infoRes = await fetch(`${GHL_V2}/oauth/installedLocations`, {
    headers: v2Headers(agencyApiKey),
  });

  if (infoRes.ok) {
    const info = await infoRes.json();
    const locations: GHLLocation[] = (info.locations ?? info.installedLocations ?? []).map((l: any) => ({
      id: l.id ?? l._id,
      name: l.name,
      email: l.email,
      logoUrl: l.logoUrl,
    }));
    if (locations.length) return locations;
  }

  // Fallback: try /locations/search (agency scope)
  const res = await fetch(`${GHL_V2}/locations/search?limit=100`, {
    headers: v2Headers(agencyApiKey),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL locations fetch failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.locations ?? []) as GHLLocation[];
}

// ── Location-level: pipelines ────────────────────────────────────────────────
export async function fetchLocationPipelines(
  apiKey: string,
  locationId: string
): Promise<GHLPipeline[]> {
  const res = await fetch(`${GHL_V2}/opportunities/pipelines?locationId=${locationId}`, {
    headers: v2Headers(apiKey),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.pipelines ?? []) as GHLPipeline[];
}

// ── Location-level: custom fields ───────────────────────────────────────────
export async function fetchCustomFields(
  apiKey: string,
  locationId: string
): Promise<GHLCustomField[]> {
  const res = await fetch(`${GHL_V2}/locations/${locationId}/customFields`, {
    headers: v2Headers(apiKey),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.customFields ?? []) as GHLCustomField[];
}

// ── Shared pagination: fetch every opportunity in a pipeline ────────────────
// GHL's actual /opportunities/search response does not reliably include a
// `meta.nextPageUrl` field (confirmed against GHL's own docs and a working
// third-party integration — the response shape is `{ opportunities, meta,
// aggregations }` with `meta.total` as the authoritative count, not a next-
// page link). The old logic required `meta.nextPageUrl` to be truthy to
// continue paginating, which meant it silently stopped after the FIRST page
// for every pipeline — any pipeline with more than 100 opportunities ever
// created had its lead/stage counts, CPL attribution, and "last lead" dates
// all quietly truncated to whatever fit in that first page. This continues
// instead until either the page comes back short (fewer than `limit` items —
// there's nothing left) or, when GHL reports `meta.total`, until that many
// have been collected — whichever signal fires first, so a wrong/missing
// `total` can't cause under- OR over-fetching.
// Turns a failed GHL response into a message someone can act on. GHL's own
// error bodies are short JSON ({ message, statusCode }) and never echo the
// token back, so this is safe to show in the UI.
async function describeGhlFailure(res: Response): Promise<string> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = String(j.message ?? j.error ?? text);
    } catch {
      detail = text;
    }
  } catch { /* body unreadable — fall through to the status hint alone */ }
  detail = detail.slice(0, 200);

  const hint =
    res.status === 401 ? 'GHL rejected the API key (expired, revoked, or not the right key) — re-enter it in Admin Settings > GHL Sync.'
    : res.status === 403 ? "The API key is valid but isn't allowed to read this location's opportunities — check its scopes/location access in GHL."
    : res.status === 404 ? "GHL couldn't find that location or pipeline — check the location/pipeline IDs."
    : res.status === 422 ? 'GHL rejected the request parameters.'
    : res.status === 429 ? 'GHL rate-limited the request — try again in a minute.'
    : res.status >= 500 ? 'GHL is having trouble on their end — try again shortly.'
    : 'Unexpected response from GHL.';
  return `GHL returned ${res.status}. ${hint}${detail ? ` (GHL said: "${detail}")` : ''}`;
}

// `strict` makes a non-OK response throw instead of silently stopping. The
// default (lenient) behavior is what the per-client stats paths have always
// relied on — an outage there just shows zeros — but the Sales Tracker has no
// way to tell "no leads" from "GHL rejected us" without it, so it opts in.
async function fetchAllOpportunitiesRaw(
  apiKey: string,
  locationId: string,
  pipelineId: string,
  opts: { strict?: boolean } = {}
): Promise<any[]> {
  const headers = v2Headers(apiKey);
  const limit = 100;
  const HARD_PAGE_CAP = 500; // 50,000 opportunities — a runaway-loop guard, not a real ceiling
  let allOpps: any[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;

  for (let page = 0; page < HARD_PAGE_CAP; page++) {
    // status=all: the endpoint documents open/won/lost/abandoned/all with no stated default, and
    // "leads" here means every opportunity in the pipeline — so ask for all of them rather than
    // rely on whichever statuses the API happens to return when it isn't told.
    let url = `${GHL_V2}/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&status=all&limit=${limit}`;
    if (startAfter) url += `&startAfter=${startAfter}&startAfterId=${startAfterId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (opts.strict) throw new Error(await describeGhlFailure(res));
      break;
    }
    const data = await res.json();
    const opps: any[] = data.opportunities ?? [];
    allOpps = allOpps.concat(opps);

    if (opps.length === 0) break;
    const total = typeof data.meta?.total === 'number' ? data.meta.total : undefined;
    const shortPage = opps.length < limit;
    const reachedReportedTotal = total != null && allOpps.length >= total;
    if (shortPage || reachedReportedTotal) break;

    startAfter = data.meta?.startAfter;
    startAfterId = data.meta?.startAfterId;
    // A full page with no cursor to continue from can't be paginated safely
    // — stop rather than risk re-fetching the same page forever.
    if (!startAfter || !startAfterId) break;
  }

  return allOpps;
}

// "phone"/"inhome" further down this pipeline that still mean the milestone
// happened — matched by NAME, not position: "Unqualified"/"Lost" sort near
// the end of this template despite being branch exits, not further progress,
// so a position comparison would sweep those in too. Only the stages whose
// name makes the milestone unambiguous are included; ambiguous ones (e.g.
// "Long Term Nurture", "Timelines Farout" — could apply before or after a
// call) are deliberately left out rather than guessed at.
function stageImpliesPhoneHappened(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('quoted') || n.includes('converted')
    || (n.includes('no-show') && n.includes('call'))
    || (n.includes('rescheduled') && n.includes('home'))
    || (n.includes('lost') && n.includes('phone'));
}
function stageImpliesInhomeHappened(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('quoted') || n.includes('converted')
    || (n.includes('rescheduled') && n.includes('home'));
}

// A booked appointment is assumed to have been a show unless it's CURRENTLY
// sitting in a stage that says otherwise — an exact match on the present
// stage, not cumulative like phone/inhome above, since moving on from here
// (e.g. into Rescheduled or Quoted) means it stopped being a no-show.
function stageIsNoShow(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('no-show') || n.includes('no show');
}

// ── Location-level: opportunity counts per stage ─────────────────────────────
export async function fetchGHLPipelineStats(
  apiKey: string,
  locationId: string,
  pipelineId: string,
  stageIds: { leads?: string; contacted?: string; unqualified?: string; phone?: string; inhome?: string },
  // strict: throw on a failed GHL call instead of returning zeros — callers
  // that persist the result (the cached lead counts) need to tell "0 leads"
  // apart from "GHL refused us" or they overwrite good data with nothing.
  opts: { strict?: boolean } = {}
): Promise<PipelineStats> {
  const [allOpps, pipelines] = await Promise.all([
    fetchAllOpportunitiesRaw(apiKey, locationId, pipelineId, opts) as Promise<GHLOpportunity[]>,
    fetchLocationPipelines(apiKey, locationId),
  ]);
  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];

  const count = (stageId?: string) =>
    stageId ? allOpps.filter((o) => o.pipelineStageId === stageId).length : 0;

  // phone/inhome mean "this milestone was ever reached", not "still sitting
  // there right now" — GHL moves an opportunity's current stage forward as
  // work continues, so an exact match on the tracked stage id alone
  // undercounts as soon as someone gets quoted, converted, rescheduled,
  // marked no-show, or lost. Confirmed live 2026-09-28: in-home ÷ phone was
  // reporting over 100% for 9 of 11 active clients, because most leads get
  // moved on right after the call. Reaching "inhome" implies "phone" already
  // happened, so that's folded in too — callers must no longer sum
  // phone + inhome for a total (inhome is now a subset of phone).
  const phoneReached = new Set(
    [stageIds.phone, stageIds.inhome, ...stages.filter((s) => stageImpliesPhoneHappened(s.name)).map((s) => s.id)]
      .filter((id): id is string => !!id)
  );
  const inhomeReached = new Set(
    [stageIds.inhome, ...stages.filter((s) => stageImpliesInhomeHappened(s.name)).map((s) => s.id)]
      .filter((id): id is string => !!id)
  );
  const countReached = (stageId: string | undefined, reached: Set<string>) =>
    stageId ? allOpps.filter((o) => reached.has(o.pipelineStageId)).length : 0;

  const noShowStageIds = new Set(stages.filter((s) => stageIsNoShow(s.name)).map((s) => s.id));
  const noShow = allOpps.filter((o) => noShowStageIds.has(o.pipelineStageId)).length;

  // Total leads = all opps ever in the pipeline (not just those still in "New Lead" stage)
  return {
    leads: allOpps.length,
    contacted: count(stageIds.contacted),
    unqualified: count(stageIds.unqualified),
    phone: countReached(stageIds.phone, phoneReached),
    inhome: countReached(stageIds.inhome, inhomeReached),
    noShow,
  };
}

export interface GHLOpportunityRaw {
  id: string;
  name: string;
  pipelineStageId: string;
  monetaryValue?: number;
  createdAt: string;
  contact?: { name?: string; email?: string; phone?: string };
  attributions?: { utmAdId?: string; adSource?: string }[];
}

// Raw opportunities (with UTM attribution) for a pipeline — used to attribute
// leads back to the specific Meta ad that generated them via utmAdId.
export async function fetchGHLOpportunitiesRaw(
  apiKey: string,
  locationId: string,
  pipelineId: string
): Promise<GHLOpportunityRaw[]> {
  return fetchAllOpportunitiesRaw(apiKey, locationId, pipelineId) as Promise<GHLOpportunityRaw[]>;
}

// Exported for callers that need the raw opportunities plus fields
// fetchGHLOpportunitiesRaw's narrower type doesn't carry (e.g. `status`,
// `updatedAt`, `assignedTo`) — same pagination guarantees as above.
export { fetchAllOpportunitiesRaw };

// ── Config check ─────────────────────────────────────────────────────────────
// A client created without a GoHighLevel pipeline (every field on that onboarding
// step is optional, and it's easy to click through without noticing) never has
// leads pulled at all — every caller used to just skip the fetch and quietly show
// zeros, with nothing to say why. Shared so every place that checks the same
// thing (the tracker, the client's own dashboard, Meta Health) says it the same
// way. Returns null when a pipeline IS connected — i.e. there's nothing to report.
export function describeMissingGhlConfig(client: { ghl_location_id: string | null; ghl_pipeline_id: string | null }): string | null {
  if (client.ghl_location_id && client.ghl_pipeline_id) return null;
  if (!client.ghl_location_id && !client.ghl_pipeline_id) {
    return 'No GoHighLevel pipeline is connected for this client — leads have never been pulled.';
  }
  if (!client.ghl_pipeline_id) {
    return "A GoHighLevel location is saved, but no pipeline has been chosen — leads can't be pulled without one.";
  }
  return "A GoHighLevel pipeline is set, but no location is saved — leads can't be pulled without one.";
}

// ── Key resolver ─────────────────────────────────────────────────────────────
// If client has their own key use it; otherwise fall back to agency key.
export function resolveApiKey(locationApiKey: string | null, agencyApiKey: string): string {
  return locationApiKey && locationApiKey.trim() ? locationApiKey.trim() : agencyApiKey;
}

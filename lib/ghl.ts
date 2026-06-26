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

// ── Location-level: opportunity counts per stage ─────────────────────────────
export async function fetchGHLPipelineStats(
  apiKey: string,
  locationId: string,
  pipelineId: string,
  stageIds: { leads?: string; contacted?: string; unqualified?: string; phone?: string; inhome?: string }
): Promise<PipelineStats> {
  const headers = v2Headers(apiKey);

  // Paginate through all opportunities for this pipeline
  let allOpps: GHLOpportunity[] = [];
  const limit = 100;
  let startAfter: string | undefined;
  let startAfterId: string | undefined;

  while (true) {
    let url = `${GHL_V2}/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&limit=${limit}`;
    if (startAfter) url += `&startAfter=${startAfter}&startAfterId=${startAfterId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const opps: GHLOpportunity[] = data.opportunities ?? [];
    allOpps = allOpps.concat(opps);
    if (opps.length < limit || !data.meta?.nextPageUrl) break;
    startAfter = data.meta.startAfter;
    startAfterId = data.meta.startAfterId;
  }

  const count = (stageId?: string) =>
    stageId ? allOpps.filter((o) => o.pipelineStageId === stageId).length : 0;

  // Total leads = all opps ever in the pipeline (not just those still in "New Lead" stage)
  return {
    leads: allOpps.length,
    contacted: count(stageIds.contacted),
    unqualified: count(stageIds.unqualified),
    phone: count(stageIds.phone),
    inhome: count(stageIds.inhome),
  };
}

// ── Key resolver ─────────────────────────────────────────────────────────────
// If client has their own key use it; otherwise fall back to agency key.
export function resolveApiKey(locationApiKey: string | null, agencyApiKey: string): string {
  return locationApiKey && locationApiKey.trim() ? locationApiKey.trim() : agencyApiKey;
}

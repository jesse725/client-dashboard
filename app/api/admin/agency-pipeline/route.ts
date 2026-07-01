import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchLocationPipelines } from '@/lib/ghl';

const AGENCY_API_KEY = 'pit-04a0e11c-af24-4ca8-a4cc-bc7745fae31b';
const GHL_V2 = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

// Fetch all opportunities in a pipeline and return contact name → stage name map
async function fetchPipelineOpportunities(locationId: string, pipelineId: string) {
  const headers = {
    Authorization: `Bearer ${AGENCY_API_KEY}`,
    Version: GHL_VERSION,
  };

  // Get pipeline stages first
  const pRes = await fetch(`${GHL_V2}/opportunities/pipelines?locationId=${locationId}`, { headers });
  const pData = pRes.ok ? await pRes.json() : {};
  const pipeline = (pData.pipelines ?? []).find((p: any) => p.id === pipelineId);
  const stageMap: Record<string, string> = {};
  for (const s of pipeline?.stages ?? []) stageMap[s.id] = s.name;

  // Paginate opportunities
  let opps: any[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;
  while (true) {
    let url = `${GHL_V2}/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&limit=100`;
    if (startAfter) url += `&startAfter=${startAfter}&startAfterId=${startAfterId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const batch = data.opportunities ?? [];
    opps = opps.concat(batch);
    if (batch.length < 100 || !data.meta?.nextPageUrl) break;
    startAfter = data.meta.startAfter;
    startAfterId = data.meta.startAfterId;
  }

  return opps.map((o: any) => ({
    id: o.id,
    name: o.name ?? o.contact?.name ?? '',
    stageName: stageMap[o.pipelineStageId] ?? 'Unknown',
    stageId: o.pipelineStageId,
    status: o.status,
    updatedAt: o.updatedAt,
  }));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getDb();
  const locationId = (db.prepare("SELECT value FROM settings WHERE key = 'agency_ghl_location_id'").get() as any)?.value;
  const pipelineId = (db.prepare("SELECT value FROM settings WHERE key = 'agency_ghl_pipeline_id'").get() as any)?.value;

  // If no location configured, return pipelines discovery mode
  if (!locationId) {
    return NextResponse.json({ configured: false, message: 'Agency location ID not set' });
  }

  // If location set but no pipeline, return available pipelines
  if (!pipelineId) {
    try {
      const pipelines = await fetchLocationPipelines(AGENCY_API_KEY, locationId);
      return NextResponse.json({ configured: false, locationId, pipelines });
    } catch {
      return NextResponse.json({ configured: false, error: 'Could not fetch pipelines' });
    }
  }

  try {
    const opps = await fetchPipelineOpportunities(locationId, pipelineId);
    return NextResponse.json({ configured: true, opportunities: opps });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const db = getDb();

  if (body.agency_ghl_location_id !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('agency_ghl_location_id', ?)").run(body.agency_ghl_location_id);
  }
  if (body.agency_ghl_pipeline_id !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('agency_ghl_pipeline_id', ?)").run(body.agency_ghl_pipeline_id);
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchLocationPipelines, fetchAllOpportunitiesRaw } from '@/lib/ghl';

const GHL_V2 = 'https://services.leadconnectorhq.com';

// Fetch all opportunities in a pipeline and return contact name → stage name map
async function fetchPipelineOpportunities(apiKey: string, locationId: string, pipelineId: string) {
  const headers = { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28' };

  // Get pipeline stages first
  const pRes = await fetch(`${GHL_V2}/opportunities/pipelines?locationId=${locationId}`, { headers });
  const pData = pRes.ok ? await pRes.json() : {};
  const pipeline = (pData.pipelines ?? []).find((p: any) => p.id === pipelineId);
  const stageMap: Record<string, string> = {};
  for (const s of pipeline?.stages ?? []) stageMap[s.id] = s.name;

  const opps = await fetchAllOpportunitiesRaw(apiKey, locationId, pipelineId);

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
  // Same agency key GHL Sync uses (Admin Settings) — was previously a hardcoded
  // token duplicated in source here and in sales-pipeline/route.ts.
  const agencyKey = (db.prepare("SELECT value FROM settings WHERE key = 'ghl_agency_key'").get() as any)?.value;
  if (!agencyKey) {
    return NextResponse.json({ configured: false, error: 'GHL agency API key is not configured — set it in Admin Settings > GHL Sync.' });
  }

  // If no location configured, return pipelines discovery mode
  if (!locationId) {
    return NextResponse.json({ configured: false, message: 'Agency location ID not set' });
  }

  // If location set but no pipeline, return available pipelines
  if (!pipelineId) {
    try {
      const pipelines = await fetchLocationPipelines(agencyKey, locationId);
      return NextResponse.json({ configured: false, locationId, pipelines });
    } catch {
      return NextResponse.json({ configured: false, error: 'Could not fetch pipelines' });
    }
  }

  try {
    const opps = await fetchPipelineOpportunities(agencyKey, locationId, pipelineId);
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

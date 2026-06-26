import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchLocationPipelines } from '@/lib/ghl';
import crypto from 'crypto';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const user = session.user as any;

  if (user.role === 'admin') {
    const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
    return NextResponse.json(clients);
  } else {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(user.clientId);
    return NextResponse.json(client ? [client] : []);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  // Generate unique slug
  const base = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let slug = base;
  let i = 2;
  while (db.prepare('SELECT id FROM clients WHERE slug = ?').get(slug)) {
    slug = `${base}-${i++}`;
  }

  // Auto-generate share token
  const shareToken = crypto.randomBytes(24).toString('hex');

  // Auto-detect pipeline & stages from GHL if key + location provided
  let pipelineId = body.ghl_pipeline_id ?? null;
  let stageLeads = body.stage_leads ?? null;
  let stageContacted = body.stage_contacted ?? null;
  let stagePhone = body.stage_phone ?? null;
  let stageInhome = body.stage_inhome ?? null;
  let stageUnqualified = body.stage_unqualified ?? null;

  if (body.ghl_api_key && body.ghl_location_id && !pipelineId) {
    try {
      const pipelines = await fetchLocationPipelines(body.ghl_api_key, body.ghl_location_id);
      if (pipelines.length > 0) {
        const pipeline = pipelines[0];
        pipelineId = pipeline.id;
        for (const s of pipeline.stages) {
          const n = s.name.toLowerCase();
          if (!stageLeads && (n.includes('new lead') || n.includes('new prospect') || n === 'lead')) stageLeads = s.id;
          if (!stageContacted && (n.includes('contact') || n.includes('respond'))) stageContacted = s.id;
          if (!stagePhone && (n.includes('phone') || n.includes('call') || n.includes('discovery'))) stagePhone = s.id;
          if (!stageInhome && (n.includes('home') || n.includes('in person') || n.includes('quote') || n.includes('site'))) stageInhome = s.id;
          if (!stageUnqualified && (n.includes('unqualified') || n.includes('disqualified') || n.includes('not a fit'))) stageUnqualified = s.id;
        }
      }
    } catch { /* non-fatal */ }
  }

  const result = db.prepare(`
    INSERT INTO clients (
      name, slug, logo_url,
      ghl_api_key, ghl_location_id, ghl_pipeline_id,
      stage_leads, stage_contacted, stage_unqualified, stage_phone, stage_inhome,
      retainer_price, ad_spend, daily_ad_spend,
      meta_access_token, meta_ad_account_id,
      contract_url, slack_url,
      start_date, date_launched, date_billed, rebilling_date, next_checkin,
      share_token
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    body.name, slug, body.logo_url ?? null,
    body.ghl_api_key ?? null, body.ghl_location_id ?? null, pipelineId,
    stageLeads, stageContacted, stageUnqualified, stagePhone, stageInhome,
    body.retainer_price ?? 0, body.ad_spend ?? 0, body.daily_ad_spend ?? 0,
    body.meta_access_token ?? null, body.meta_ad_account_id ?? null,
    body.contract_url ?? null, body.slack_url ?? null,
    body.start_date ?? new Date().toISOString().slice(0, 10),
    body.date_launched ?? null, body.date_billed ?? null,
    body.rebilling_date ?? null, body.next_checkin ?? null,
    shareToken,
  );

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(client, { status: 201 });
}

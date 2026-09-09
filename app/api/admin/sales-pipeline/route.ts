import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchAllOpportunitiesRaw } from '@/lib/ghl';

const LOCATION_ID = 'NqZup9jK9NOBs8GDIyuX';
const PIPELINE_ID = '11VwMme2JncYTm2Kq6ky';

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const adSpendRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_ad_spend'").get() as any;
  const adSpend = adSpendRow ? parseFloat(adSpendRow.value) : 0;
  // Same agency key GHL Sync uses (Admin Settings) — was previously a hardcoded
  // token duplicated in source here and in agency-pipeline/route.ts, which both
  // leaked a live credential into the repo AND meant rotating the key in
  // Settings silently stopped updating these two routes.
  const agencyKey = (db.prepare("SELECT value FROM settings WHERE key = 'ghl_agency_key'").get() as any)?.value;
  if (!agencyKey) {
    return NextResponse.json({ error: 'GHL agency API key is not configured — set it in Admin Settings > GHL Sync.' }, { status: 400 });
  }

  try {
    const raw = await fetchAllOpportunitiesRaw(agencyKey, LOCATION_ID, PIPELINE_ID);
    // GHL returns pipelineStageId, not stageId — normalize for the frontend
    const opportunities = raw.map((o: any) => ({
      id: o.id,
      name: o.name,
      monetaryValue: o.monetaryValue,
      status: o.status,
      stageId: o.pipelineStageId,
      assignedTo: o.assignedTo,
      contact: o.contact,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      source: o.source,
    }));
    return NextResponse.json({ opportunities, adSpend });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { adSpend } = await req.json();
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sales_ad_spend', ?)").run(String(adSpend));
  return NextResponse.json({ ok: true });
}

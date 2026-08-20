import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

const GHL_API_KEY = 'pit-04a0e11c-af24-4ca8-a4cc-bc7745fae31b';
const LOCATION_ID = 'NqZup9jK9NOBs8GDIyuX';
const PIPELINE_ID = '11VwMme2JncYTm2Kq6ky';

async function fetchAllOpps() {
  const opps: any[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;

  while (true) {
    const url = new URL('https://services.leadconnectorhq.com/opportunities/search');
    url.searchParams.set('location_id', LOCATION_ID);
    url.searchParams.set('pipeline_id', PIPELINE_ID);
    url.searchParams.set('limit', '100');
    if (startAfter) {
      url.searchParams.set('startAfter', startAfter);
      url.searchParams.set('startAfterId', startAfterId!);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: '2021-07-28',
      },
    });
    if (!res.ok) break;
    const data = await res.json();
    opps.push(...(data.opportunities ?? []));
    if (!data.meta?.nextPageUrl || data.opportunities?.length < 100) break;
    startAfter = data.meta.startAfter;
    startAfterId = data.meta.startAfterId;
  }

  return opps;
}

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const adSpendRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_ad_spend'").get() as any;
  const adSpend = adSpendRow ? parseFloat(adSpendRow.value) : 0;

  try {
    const raw = await fetchAllOpps();
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

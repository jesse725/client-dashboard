import { NextRequest, NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchMetaAdStats } from '@/lib/meta';

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_access_token'").get() as any;
  const acctRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_ad_account_id'").get() as any;
  const accessToken = tokenRow?.value ?? '';
  const adAccountId = acctRow?.value ?? '';

  if (!accessToken || !adAccountId) {
    return NextResponse.json({ connected: false, adAccountId: '' });
  }

  try {
    const [last7d, thisMonth, lifetime] = await Promise.all([
      fetchMetaAdStats(accessToken, adAccountId, 'last_7d'),
      fetchMetaAdStats(accessToken, adAccountId, 'this_month'),
      fetchMetaAdStats(accessToken, adAccountId, 'maximum'),
    ]);
    return NextResponse.json({ connected: true, adAccountId, last7d, thisMonth, lifetime });
  } catch (e: any) {
    return NextResponse.json({ connected: true, adAccountId, error: e.message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { access_token, ad_account_id } = await req.json();
  const db = getDb();

  if (ad_account_id !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sales_meta_ad_account_id', ?)").run(String(ad_account_id));
  }
  // Only overwrite the token if a real (non-masked) value was sent
  if (access_token && !String(access_token).includes('•')) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sales_meta_access_token', ?)").run(String(access_token));
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchMetaAdSpendRange } from '@/lib/meta';

// Returns Meta ad spend for each requested week: ?weeks=2026-07-06,2026-07-13,...
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const weeksParam = searchParams.get('weeks');
  if (!weeksParam) return NextResponse.json({ error: 'weeks is required' }, { status: 400 });
  const weeks = weeksParam.split(',').filter(Boolean);

  const db = getDb();
  const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_access_token'").get() as any;
  const acctRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_ad_account_id'").get() as any;
  const accessToken = tokenRow?.value ?? '';
  const adAccountId = acctRow?.value ?? '';

  if (!accessToken || !adAccountId) {
    return NextResponse.json({ error: 'Meta ad account not connected' }, { status: 400 });
  }

  try {
    const results = await Promise.all(weeks.map(async (weekStart) => {
      const start = new Date(weekStart + 'T00:00:00');
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const since = weekStart;
      const until = end.toISOString().slice(0, 10);
      const spend = await fetchMetaAdSpendRange(accessToken, adAccountId, since, until);
      return { weekStart, spend };
    }));
    return NextResponse.json({ weeks: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

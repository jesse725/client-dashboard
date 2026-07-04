import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const rows = db.prepare('SELECT * FROM sales_weekly ORDER BY week_start DESC').all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { week_start, ad_spend, cash_collected, total_ltv, qualified_calls, booked_ad } = body;
  if (!week_start) return NextResponse.json({ error: 'week_start is required' }, { status: 400 });

  const db = getDb();
  const existing = db.prepare('SELECT week_start FROM sales_weekly WHERE week_start = ?').get(week_start);
  if (existing) {
    db.prepare(
      `UPDATE sales_weekly SET ad_spend = ?, cash_collected = ?, total_ltv = ?, qualified_calls = ?, booked_ad = ?, updated_at = datetime('now') WHERE week_start = ?`
    ).run(ad_spend || 0, cash_collected || 0, total_ltv || 0, qualified_calls || 0, booked_ad || 0, week_start);
  } else {
    db.prepare(
      `INSERT INTO sales_weekly (week_start, ad_spend, cash_collected, total_ltv, qualified_calls, booked_ad) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(week_start, ad_spend || 0, cash_collected || 0, total_ltv || 0, qualified_calls || 0, booked_ad || 0);
  }

  const row = db.prepare('SELECT * FROM sales_weekly WHERE week_start = ?').get(week_start);
  return NextResponse.json(row);
}

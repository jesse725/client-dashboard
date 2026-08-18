import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireFinancialAccess, getEntriesForMonth } from '@/lib/income';

export async function GET(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'month query param required (YYYY-MM)' }, { status: 400 });

  return NextResponse.json({ entries: getEntriesForMonth(month) });
}

export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { name, category, fund_id, amount, date, notes } = await req.json();
  if (!name || !['other', 'startup_fund'].includes(category) || !date) {
    return NextResponse.json({ error: 'name, a valid category, and date are required' }, { status: 400 });
  }
  if (category === 'startup_fund' && !fund_id) {
    return NextResponse.json({ error: 'fund_id is required for startup_fund entries' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO expense_entries (name, category, fund_id, amount, date, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, category, category === 'startup_fund' ? fund_id : null, Number(amount) || 0, date, notes || null);

  return NextResponse.json({ id: result.lastInsertRowid });
}

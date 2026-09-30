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

  const { name, category, amount, date, notes } = await req.json();
  // 'startup_fund' dropped from the accepted categories — that feature is
  // gone from the UI (historical rows tagged with it stay in the database
  // untouched, just nothing creates new ones anymore).
  if (!name || category !== 'other' || !date) {
    return NextResponse.json({ error: 'name, category "other", and date are required' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO expense_entries (name, category, fund_id, amount, date, notes) VALUES (?, ?, NULL, ?, ?, ?)'
  ).run(name, category, Number(amount) || 0, date, notes || null);

  return NextResponse.json({ id: result.lastInsertRowid });
}

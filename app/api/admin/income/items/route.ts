import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireFinancialAccess } from '@/lib/income';

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const items = db.prepare('SELECT * FROM expense_items ORDER BY category, name').all();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { name, category, monthly_amount, next_review_date } = await req.json();
  if (!name || !['subscription', 'payroll', 'other'].includes(category)) {
    return NextResponse.json({ error: 'name and a valid category are required' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO expense_items (name, category, monthly_amount, next_review_date) VALUES (?, ?, ?, ?)'
  ).run(name, category, Number(monthly_amount) || 0, next_review_date || null);

  return NextResponse.json({ id: result.lastInsertRowid });
}

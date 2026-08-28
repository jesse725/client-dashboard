import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getPeriodWithTotal } from '@/lib/payroll';

// Logs a bonus against a pay period — addedBy/addedAt form the audit trail
// the admin can see on each period (who logged what, and when).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { description, amount } = await req.json();
  if (!description || amount == null) {
    return NextResponse.json({ error: 'description and amount are required' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const addedBy = (session?.user as any)?.email ?? 'unknown';

  const db = getDb();
  const period = db.prepare('SELECT id FROM pay_periods WHERE id = ?').get(id);
  if (!period) return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });

  db.prepare(
    'INSERT INTO pay_period_bonuses (pay_period_id, description, amount, added_by) VALUES (?, ?, ?, ?)'
  ).run(id, description, Number(amount), addedBy);

  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

// Updates an existing bonus item's amount in place — used by the "Variable
// Pay" quick-edit field so re-setting it updates the one line item instead
// of piling up duplicates. Refreshes added_by/added_at to reflect the edit.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const bonusId = searchParams.get('bonusId');
  if (!bonusId) return NextResponse.json({ error: 'bonusId query param required' }, { status: 400 });

  const { id } = await params;
  const { amount } = await req.json();
  if (amount == null) return NextResponse.json({ error: 'amount is required' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const addedBy = (session?.user as any)?.email ?? 'unknown';

  const db = getDb();
  db.prepare(
    "UPDATE pay_period_bonuses SET amount = ?, added_by = ?, added_at = datetime('now') WHERE id = ? AND pay_period_id = ?"
  ).run(Number(amount), addedBy, bonusId, id);

  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const bonusId = searchParams.get('bonusId');
  if (!bonusId) return NextResponse.json({ error: 'bonusId query param required' }, { status: 400 });

  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM pay_period_bonuses WHERE id = ? AND pay_period_id = ?').run(bonusId, id);
  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

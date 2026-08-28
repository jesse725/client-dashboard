import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getPeriodWithTotal } from '@/lib/payroll';

// Manual tracking only — this does NOT send money. The real transfer happens
// in Wise; this just records that it happened.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const period = db.prepare('SELECT id FROM pay_periods WHERE id = ?').get(id);
  if (!period) return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });

  db.prepare("UPDATE pay_periods SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(id);
  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

// Undo — in case it was marked paid by mistake.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  db.prepare("UPDATE pay_periods SET status = 'pending', paid_at = NULL WHERE id = ?").run(id);
  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

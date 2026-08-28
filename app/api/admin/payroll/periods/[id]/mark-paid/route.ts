import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getPeriodWithTotal, recordPayment, undoPayment } from '@/lib/payroll';
import type { PaymentMethod } from '@/types';

const VALID_METHODS: PaymentMethod[] = ['bank_transfer', 'wise', 'paypal', 'check', 'other'];

// Manual tracking only — this does NOT send money. The real transfer happens
// in Wise/bank transfer/etc.; this records that it happened, with enough
// detail (method, reference, notes, date) to keep an organized history.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const { amount, method, reference, notes, paidAt } = body;
  if (amount == null || !VALID_METHODS.includes(method)) {
    return NextResponse.json({ error: 'amount and a valid method are required' }, { status: 400 });
  }

  const db = getDb();
  const period = db.prepare('SELECT id FROM pay_periods WHERE id = ?').get(id);
  if (!period) return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });

  const session = await getServerSession(authOptions);
  const recordedBy = (session?.user as any)?.email ?? 'unknown';

  recordPayment(Number(id), { amount: Number(amount), method, reference, notes, paidAt, recordedBy });
  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

// Undo — in case it was marked paid by mistake. The payment_records entry is
// kept (not deleted) so the history still shows it happened.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  undoPayment(Number(id));
  return NextResponse.json({ period: getPeriodWithTotal(Number(id)) });
}

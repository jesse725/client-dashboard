import { NextResponse } from 'next/server';
import { requireFinancialAccess, setMonthlyOverride, clearMonthlyOverride, OverrideField } from '@/lib/income';

const VALID_FIELDS: OverrideField[] = ['revenue', 'adSpend', 'payroll', 'totalOperatingExpenses'];

// Manually set (or clear, reverting to live/computed) a month's Revenue, Ad
// Spend, Payroll, or Total Operating Expenses.
export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { month, field, amount } = await req.json();
  if (!month || !VALID_FIELDS.includes(field) || amount == null) {
    return NextResponse.json({ error: `month, field (${VALID_FIELDS.join('|')}), and amount are required` }, { status: 400 });
  }

  setMonthlyOverride(month, field, Number(amount));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const field = searchParams.get('field');
  if (!month || !field || !VALID_FIELDS.includes(field as OverrideField)) {
    return NextResponse.json({ error: `month and field (${VALID_FIELDS.join('|')}) query params are required` }, { status: 400 });
  }

  clearMonthlyOverride(month, field as OverrideField);
  return NextResponse.json({ ok: true });
}

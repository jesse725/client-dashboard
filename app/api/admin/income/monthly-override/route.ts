import { NextResponse } from 'next/server';
import { requireFinancialAccess, setMonthlyOverride, clearMonthlyOverride } from '@/lib/income';

// Manually set (or clear, reverting to live) a month's Revenue or Ad Spend.
export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { month, field, amount } = await req.json();
  if (!month || !['revenue', 'adSpend'].includes(field) || amount == null) {
    return NextResponse.json({ error: 'month, field (revenue|adSpend), and amount are required' }, { status: 400 });
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
  if (!month || !field || !['revenue', 'adSpend'].includes(field)) {
    return NextResponse.json({ error: 'month and field (revenue|adSpend) query params are required' }, { status: 400 });
  }

  clearMonthlyOverride(month, field as 'revenue' | 'adSpend');
  return NextResponse.json({ ok: true });
}

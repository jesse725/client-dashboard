import { NextResponse } from 'next/server';
import { requireFinancialAccess, setItemMonthValue } from '@/lib/income';

// Sets a recurring item's (subscription/payroll) amount for one specific month
// only — other months are untouched and keep carrying forward from whatever
// they last resolved to.
export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { item_id, month, amount } = await req.json();
  if (!item_id || !month || amount == null) {
    return NextResponse.json({ error: 'item_id, month, and amount are required' }, { status: 400 });
  }

  setItemMonthValue(Number(item_id), month, Number(amount));
  return NextResponse.json({ ok: true });
}

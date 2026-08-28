import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// Columns are a best-effort guess at what's useful for manual entry into
// Wise — this has NOT been verified against Wise's actual bulk-payment
// import template. Check real column names/order there before relying on
// this for a real batch upload; treat it as a well-organized reference list
// in the meantime.
export async function GET(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const payoutDate = searchParams.get('payoutDate');
  if (!payoutDate) return NextResponse.json({ error: 'payoutDate query param required (YYYY-MM-DD)' }, { status: 400 });

  const db = getDb();
  const periods = db.prepare(`
    SELECT pp.id, pp.base_amount, e.name, e.email
    FROM pay_periods pp
    JOIN employees e ON e.id = pp.employee_id
    WHERE pp.payout_date = ? AND pp.status = 'pending'
    ORDER BY e.name
  `).all(payoutDate) as any[];

  const rows = periods.map(p => {
    const bonusTotal = (db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM pay_period_bonuses WHERE pay_period_id = ?').get(p.id) as any).s;
    const total = p.base_amount + bonusTotal;
    return { name: p.name, email: p.email, amount: total };
  });

  const header = ['Recipient Name', 'Recipient Email', 'Amount', 'Currency', 'Reference'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.name),
      csvEscape(r.email),
      r.amount.toFixed(2),
      'USD',
      csvEscape(`Payroll ${payoutDate}`),
    ].join(','));
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="payroll-${payoutDate}.csv"`,
    },
  });
}

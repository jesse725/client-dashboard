import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ensureCurrentPeriod, getPeriodWithTotal } from '@/lib/payroll';

// Payroll is Jesse-only, same as the rest of this app's financial data —
// other admins can't see coworkers' pay.
export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const employees = db.prepare('SELECT * FROM employees ORDER BY active DESC, name').all() as any[];

  const withCurrentPeriod = employees.map(e => {
    if (!e.active) return { ...e, currentPeriod: null };
    const periodId = ensureCurrentPeriod(e.id);
    return { ...e, currentPeriod: getPeriodWithTotal(periodId) };
  });

  return NextResponse.json({ employees: withCurrentPeriod });
}

export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { name, role, email } = body;
  if (!name || !role || !email) {
    return NextResponse.json({ error: 'name, role, and email are required' }, { status: 400 });
  }

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO employees (
        name, role, email, active, base_amount_per_period, per_client_fee,
        revenue_share_pct, hourly_bonus_rate, hourly_bonus_threshold_minutes, notes
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      name, role, String(email).trim().toLowerCase(),
      Number(body.baseAmountPerPeriod) || 0,
      Number(body.perClientFee) || 0,
      Number(body.revenueSharePct) || 0,
      Number(body.hourlyBonusRate) || 0,
      Number(body.hourlyBonusThresholdMinutes) || 60,
      body.notes || null
    );
    return NextResponse.json({ id: result.lastInsertRowid });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) {
      return NextResponse.json({ error: 'An employee with that email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

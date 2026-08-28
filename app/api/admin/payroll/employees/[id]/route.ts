import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getEmployeeById, getPeriodsForEmployee } from '@/lib/payroll';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const employee = getEmployeeById(Number(id));
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ employee, periods: getPeriodsForEmployee(Number(id)) });
}

const ALLOWED_FIELDS: Record<string, string> = {
  name: 'name', role: 'role', email: 'email', active: 'active',
  baseAmountPerPeriod: 'base_amount_per_period', perClientFee: 'per_client_fee',
  revenueSharePct: 'revenue_share_pct', hourlyBonusRate: 'hourly_bonus_rate',
  hourlyBonusThresholdMinutes: 'hourly_bonus_threshold_minutes', notes: 'notes',
  paymentMethod: 'payment_method', agreementUrl: 'agreement_url', assignedTo: 'assigned_to',
};

const VALID_PAYMENT_METHODS = ['bank_transfer', 'wise', 'paypal', 'check', 'other'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  // payment_method has no DB-level CHECK (SQLite can't ALTER one in), so
  // validate here instead.
  if ('paymentMethod' in body && !VALID_PAYMENT_METHODS.includes(body.paymentMethod)) {
    return NextResponse.json({ error: 'Invalid paymentMethod' }, { status: 400 });
  }
  const updates: string[] = [];
  const values: any[] = [];

  for (const [field, column] of Object.entries(ALLOWED_FIELDS)) {
    if (field in body) {
      updates.push(`${column} = ?`);
      values.push(
        field === 'active' ? (body[field] ? 1 : 0)
        : field === 'email' ? String(body[field]).trim().toLowerCase()
        : body[field]
      );
    }
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

  values.push(id);
  const db = getDb();
  try {
    db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) {
      return NextResponse.json({ error: 'An employee with that email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

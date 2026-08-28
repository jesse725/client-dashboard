import { NextResponse } from 'next/server';
import { requireEmployeeAccess } from '@/lib/auth';
import { getEmployeeById, ensureCurrentPeriod, getPeriodsForEmployee } from '@/lib/payroll';

// The employeeId comes ONLY from the verified session (requireEmployeeAccess)
// — never from a query param or body — so there is no id an employee could
// pass to read someone else's payroll.
export async function GET() {
  const auth = await requireEmployeeAccess();
  if (!auth.ok) return auth.response;

  const employee = getEmployeeById(auth.employeeId);
  if (!employee) return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });

  ensureCurrentPeriod(auth.employeeId);
  const periods = getPeriodsForEmployee(auth.employeeId);

  return NextResponse.json({
    employee: {
      name: employee.name,
      role: employee.role,
      email: employee.email,
      agreementUrl: employee.agreement_url,
      payStructure: {
        baseAmountPerPeriod: employee.base_amount_per_period,
        perClientFee: employee.per_client_fee,
        revenueSharePct: employee.revenue_share_pct,
        hourlyBonusRate: employee.hourly_bonus_rate,
        hourlyBonusThresholdMinutes: employee.hourly_bonus_threshold_minutes,
        paymentMethod: employee.payment_method,
        notes: employee.notes,
      },
    },
    currentPeriod: periods[0] ?? null,
    history: periods.slice(1),
  });
}

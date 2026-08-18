import { NextResponse } from 'next/server';
import {
  requireFinancialAccess, monthBounds, computeMonthPnL, monthLabel,
  getWhopRevenueByMonth, getMetaSpendByMonth, getActiveItems, getEntriesForMonth, listCycleMonths,
} from '@/lib/income';

export async function GET(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const months = listCycleMonths();
  const month = searchParams.get('month') ?? months[months.length - 1];
  const { since, until } = monthBounds(month);

  const [{ byMonth: revenueByMonth, warning: whopWarning }, { byMonth: adSpendByMonth, warning: metaWarning }] = await Promise.all([
    getWhopRevenueByMonth(),
    getMetaSpendByMonth(since, until),
  ]);

  const subscriptions = getActiveItems('subscription');
  const payroll = getActiveItems('payroll');
  const recurringSubscriptions = subscriptions.reduce((s, i) => s + i.monthly_amount, 0);
  const employeeCosts = payroll.reduce((s, i) => s + i.monthly_amount, 0);

  const pnl = computeMonthPnL(month, revenueByMonth[month] ?? 0, adSpendByMonth[month] ?? 0, recurringSubscriptions, employeeCosts);

  // Cumulative profit from cycle start through the selected month
  let cumulativeProfit = 0;
  for (const m of months) {
    if (m > month) break;
    const p = computeMonthPnL(m, revenueByMonth[m] ?? 0, adSpendByMonth[m] ?? 0, recurringSubscriptions, employeeCosts);
    cumulativeProfit += p.netProfit;
  }

  const otherExpenseEntries = getEntriesForMonth(month, 'other');
  const startupFundEntries = getEntriesForMonth(month, 'startup_fund');

  const warnings = [whopWarning, metaWarning].filter(Boolean);

  return NextResponse.json({
    month, label: monthLabel(month),
    availableMonths: months,
    pnl, cumulativeProfit,
    subscriptions, payroll,
    otherExpenseEntries, startupFundEntries,
    warnings,
  });
}

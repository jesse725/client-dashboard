import { NextResponse } from 'next/server';
import {
  requireFinancialAccess, monthBounds, computeMonthPnL, monthLabel,
  getWhopRevenueByMonth, getMetaSpendByMonth, getResolvedItems, sumResolvedItems, getEntriesForMonth, listCycleMonths,
  getMonthlyOverrides, resolveMonthValue,
} from '@/lib/income';

export async function GET(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const months = listCycleMonths();
  const month = searchParams.get('month') ?? months[months.length - 1];
  // Fetch Meta spend for the whole cycle, not just the selected month — the
  // cumulative-profit loop below needs every prior month's spend too.
  const { since } = monthBounds(months[0]);
  const { until } = monthBounds(months[months.length - 1]);

  const [{ byMonth: revenueByMonth, warning: whopWarning }, { byMonth: adSpendByMonth, warning: metaWarning }] = await Promise.all([
    getWhopRevenueByMonth(),
    getMetaSpendByMonth(since, until),
  ]);
  const revenueOverrides = getMonthlyOverrides('revenue');
  const adSpendOverrides = getMonthlyOverrides('adSpend');
  const resolveRevenue = (m: string) => resolveMonthValue(m, revenueByMonth[m], whopWarning === null, revenueOverrides);
  const resolveAdSpend = (m: string) => resolveMonthValue(m, adSpendByMonth[m], metaWarning === null, adSpendOverrides);

  const subscriptions = getResolvedItems(month, 'subscription');
  const payroll = getResolvedItems(month, 'payroll');
  const recurringSubscriptions = subscriptions.reduce((s, i) => s + i.amount, 0);
  const employeeCosts = payroll.reduce((s, i) => s + i.amount, 0);

  const revenue = resolveRevenue(month);
  const adSpend = resolveAdSpend(month);
  const pnl = computeMonthPnL(month, revenue.amount, adSpend.amount, recurringSubscriptions, employeeCosts, revenue.source, adSpend.source);

  // Cumulative profit from cycle start through the selected month — each prior
  // month uses its own resolved subscription/payroll/revenue/ad spend, not this month's.
  let cumulativeProfit = 0;
  for (const m of months) {
    if (m > month) break;
    const r = resolveRevenue(m);
    const a = resolveAdSpend(m);
    const p = computeMonthPnL(m, r.amount, a.amount, sumResolvedItems(m, 'subscription'), sumResolvedItems(m, 'payroll'), r.source, a.source);
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

import { NextResponse } from 'next/server';
import {
  requireFinancialAccess, monthBounds, computeMonthPnL, monthLabel,
  getMetaSpendByMonth, getResolvedItems, sumResolvedItems, getEntriesForMonth, listCycleMonths,
  getMonthlyOverrides, resolveMonthValue, computeChurnRetention,
} from '@/lib/income';
import { getHumanLaborForMonth } from '@/lib/payroll';

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

  const { byMonth: adSpendByMonth, warning: metaWarning } = await getMetaSpendByMonth(since, until);
  // Revenue has no live source at all — it's typed in monthly, full stop
  // (Whop is disregarded here; see lib/income.ts's MonthPnL comment).
  const revenueOverrides = getMonthlyOverrides('revenue');
  const adSpendOverrides = getMonthlyOverrides('adSpend');
  const payrollOverrides = getMonthlyOverrides('payroll');
  const totalOpExOverrides = getMonthlyOverrides('totalOperatingExpenses');
  const resolveRevenue = (m: string) => resolveMonthValue(m, undefined, false, revenueOverrides);
  const resolveAdSpend = (m: string) => resolveMonthValue(m, adSpendByMonth[m], metaWarning === null, adSpendOverrides);
  const overridesFor = (m: string) => ({ payrollOverride: payrollOverrides[m], totalOpExOverride: totalOpExOverrides[m] });

  const subscriptions = getResolvedItems(month, 'subscription');
  const recurringSubscriptions = subscriptions.reduce((s, i) => s + i.amount, 0);
  const humanLabor = getHumanLaborForMonth(month);

  const revenue = resolveRevenue(month);
  const adSpend = resolveAdSpend(month);
  const pnl = computeMonthPnL(month, revenue.amount, adSpend.amount, recurringSubscriptions, humanLabor.total, revenue.source, adSpend.source, overridesFor(month));
  const churnRetention = computeChurnRetention(month);

  // Cumulative profit from cycle start through the selected month — each prior
  // month uses its own resolved subscription/human-labor/revenue/ad spend,
  // not this month's.
  let cumulativeProfit = 0;
  for (const m of months) {
    if (m > month) break;
    const r = resolveRevenue(m);
    const a = resolveAdSpend(m);
    const p = computeMonthPnL(m, r.amount, a.amount, sumResolvedItems(m, 'subscription'), getHumanLaborForMonth(m).total, r.source, a.source, overridesFor(m));
    cumulativeProfit += p.netProfit;
  }

  const otherExpenseEntries = getEntriesForMonth(month, 'other');

  const warnings = [metaWarning].filter(Boolean);

  return NextResponse.json({
    month, label: monthLabel(month),
    availableMonths: months,
    pnl, cumulativeProfit, churnRetention,
    subscriptions, humanLaborItems: humanLabor.items,
    otherExpenseEntries,
    warnings,
  });
}

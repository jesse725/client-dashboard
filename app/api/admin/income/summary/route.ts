import { NextResponse } from 'next/server';
import {
  requireFinancialAccess, listCycleMonths, monthBounds, computeMonthPnL,
  getMetaSpendByMonth, sumResolvedItems,
  getMonthlyOverrides, resolveMonthValue, computeChurnRetention, getClientLtvTotal,
  getClientLtvBreakdown, getClientStageBreakdown, getAvgClientTenureMonths,
} from '@/lib/income';
import { getHumanLaborForMonth } from '@/lib/payroll';

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const months = listCycleMonths();
  const { since } = monthBounds(months[0]);
  const { until } = monthBounds(months[months.length - 1]);

  const { byMonth: adSpendByMonth, warning: metaWarning } = await getMetaSpendByMonth(since, until);
  const revenueOverrides = getMonthlyOverrides('revenue');
  const adSpendOverrides = getMonthlyOverrides('adSpend');
  const payrollOverrides = getMonthlyOverrides('payroll');
  const totalOpExOverrides = getMonthlyOverrides('totalOperatingExpenses');

  // Subscriptions are resolved per month (carry-forward from the most recent
  // edit); Human Labor is synced live from the real Payroll dashboard (actual
  // recorded pay periods) unless overridden. Revenue is typed in monthly, full
  // stop — no live source. Ad Spend prefers a manual override, falling back
  // to the live Meta figure.
  const monthly = months.map(month => {
    const revenue = resolveMonthValue(month, undefined, false, revenueOverrides);
    const adSpend = resolveMonthValue(month, adSpendByMonth[month], metaWarning === null, adSpendOverrides);
    const recurringSubscriptions = sumResolvedItems(month, 'subscription');
    const humanLabor = getHumanLaborForMonth(month);
    const pnl = computeMonthPnL(month, revenue.amount, adSpend.amount, recurringSubscriptions, humanLabor.total, revenue.source, adSpend.source, {
      payrollOverride: payrollOverrides[month], totalOpExOverride: totalOpExOverrides[month],
    });
    return { ...pnl, humanLaborItems: humanLabor.items, churnRetention: computeChurnRetention(month) };
  });

  const ytdRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const ytdAdSpend = monthly.reduce((s, m) => s + m.adSpend, 0);
  const ytdGrossProfit = monthly.reduce((s, m) => s + m.grossProfit, 0);
  const ytdNetProfit = monthly.reduce((s, m) => s + m.netProfit, 0);
  const ytdOperatingExpenses = monthly.reduce((s, m) => s + m.totalOperatingExpenses, 0);
  const ytdTotalCosts = ytdAdSpend + ytdOperatingExpenses;
  const monthsWithRevenue = monthly.filter(m => m.revenue > 0);
  const avgProfitMarginPct = monthsWithRevenue.length > 0
    ? monthsWithRevenue.reduce((s, m) => s + m.profitMarginPct, 0) / monthsWithRevenue.length : null;
  // Overall margin computed from totals directly (not an average of monthly
  // %s), so one low-revenue month can't skew it — matches how a real income
  // statement rolls up a period.
  const overallMarginPct = ytdRevenue > 0 ? (ytdNetProfit / ytdRevenue) * 100 : null;
  const monthsWithSpend = monthly.filter(m => m.adSpend > 0);
  const avgRoas = monthsWithSpend.length > 0
    ? monthsWithSpend.reduce((s, m) => s + (m.roas ?? 0), 0) / monthsWithSpend.length : null;
  // Dollars earned per dollar spent running the business (ad spend + subs +
  // payroll + other) — a business-wide analog of ROAS.
  const profitabilityRatio = ytdTotalCosts > 0 ? ytdRevenue / ytdTotalCosts : null;

  const warnings = [metaWarning].filter(Boolean);

  const clientLtvTotal = getClientLtvTotal();
  // Dollars of client lifetime value generated per dollar of the agency's own
  // acquisition ad spend — same "LTV over ad spend" shape as the Sales
  // Tracker's existing LTV:CAC card (app/admin/sales/page.tsx), so this
  // isn't a third, differently-defined ratio; it's the same one, surfaced
  // here too since this page is meant to be the one money-hub view.
  const ltvToCac = ytdAdSpend > 0 ? clientLtvTotal / ytdAdSpend : null;
  // Latest month's churn/retention as the headline figure — every month's
  // own number is still visible by expanding that month's card.
  const latestChurnRetention = monthly.length > 0 ? monthly[monthly.length - 1].churnRetention : null;

  return NextResponse.json({
    months: monthly,
    ytd: {
      revenue: ytdRevenue, adSpend: ytdAdSpend, grossProfit: ytdGrossProfit, netProfit: ytdNetProfit,
      totalCosts: ytdTotalCosts,
      avgProfitMarginPct, overallMarginPct, avgRoas, profitabilityRatio,
      clientLtvTotal, ltvToCac,
      avgClientTenureMonths: getAvgClientTenureMonths(),
      churnRetention: latestChurnRetention,
    },
    clientLtvBreakdown: getClientLtvBreakdown(),
    clientStageBreakdown: getClientStageBreakdown(),
    warnings,
  });
}

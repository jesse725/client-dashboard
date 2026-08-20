import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  requireFinancialAccess, listCycleMonths, monthBounds, computeMonthPnL,
  getWhopRevenueByMonth, getMetaSpendByMonth, sumResolvedItems,
  getMonthlyOverrides, resolveMonthValue,
} from '@/lib/income';

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const months = listCycleMonths();
  const { since } = monthBounds(months[0]);
  const { until } = monthBounds(months[months.length - 1]);

  const [{ byMonth: revenueByMonth, warning: whopWarning }, { byMonth: adSpendByMonth, warning: metaWarning }] = await Promise.all([
    getWhopRevenueByMonth(),
    getMetaSpendByMonth(since, until),
  ]);
  const revenueOverrides = getMonthlyOverrides('revenue');
  const adSpendOverrides = getMonthlyOverrides('adSpend');

  // Subscriptions/payroll are resolved per month (carry-forward from the most
  // recent edit), so each month in the trend can differ if it was edited.
  // Revenue/Ad Spend prefer a manual override for that month, falling back to
  // the live Whop/Meta figure.
  const monthly = months.map(month => {
    const revenue = resolveMonthValue(month, revenueByMonth[month], whopWarning === null, revenueOverrides);
    const adSpend = resolveMonthValue(month, adSpendByMonth[month], metaWarning === null, adSpendOverrides);
    const recurringSubscriptions = sumResolvedItems(month, 'subscription');
    const employeeCosts = sumResolvedItems(month, 'payroll');
    return computeMonthPnL(month, revenue.amount, adSpend.amount, recurringSubscriptions, employeeCosts, revenue.source, adSpend.source);
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

  const funds = db.prepare('SELECT * FROM startup_funds ORDER BY id').all() as any[];
  const startupFunds = funds.map(f => {
    const spent = (db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM expense_entries WHERE fund_id = ? AND category = 'startup_fund'").get(f.id) as any).s;
    const remaining = f.allocated - spent;
    return {
      id: f.id, name: f.name, notes: f.notes,
      allocated: f.allocated, spent, remaining,
      pctUtilized: f.allocated > 0 ? spent / f.allocated : 0,
    };
  });

  const warnings = [whopWarning, metaWarning].filter(Boolean);

  return NextResponse.json({
    months: monthly,
    ytd: {
      revenue: ytdRevenue, adSpend: ytdAdSpend, grossProfit: ytdGrossProfit, netProfit: ytdNetProfit,
      totalCosts: ytdTotalCosts,
      avgProfitMarginPct, overallMarginPct, avgRoas, profitabilityRatio,
    },
    startupFunds,
    warnings,
  });
}

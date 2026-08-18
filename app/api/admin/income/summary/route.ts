import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  requireFinancialAccess, listCycleMonths, monthBounds, computeMonthPnL,
  getWhopRevenueByMonth, getMetaSpendByMonth, sumActiveItems,
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

  const recurringSubscriptions = sumActiveItems('subscription');
  const employeeCosts = sumActiveItems('payroll');

  const monthly = months.map(month =>
    computeMonthPnL(month, revenueByMonth[month] ?? 0, adSpendByMonth[month] ?? 0, recurringSubscriptions, employeeCosts)
  );

  const ytdRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const ytdAdSpend = monthly.reduce((s, m) => s + m.adSpend, 0);
  const ytdGrossProfit = monthly.reduce((s, m) => s + m.grossProfit, 0);
  const ytdNetProfit = monthly.reduce((s, m) => s + m.netProfit, 0);
  const monthsWithRevenue = monthly.filter(m => m.revenue > 0);
  const avgProfitMarginPct = monthsWithRevenue.length > 0
    ? monthsWithRevenue.reduce((s, m) => s + m.profitMarginPct, 0) / monthsWithRevenue.length : null;
  const monthsWithSpend = monthly.filter(m => m.adSpend > 0);
  const avgRoas = monthsWithSpend.length > 0
    ? monthsWithSpend.reduce((s, m) => s + (m.roas ?? 0), 0) / monthsWithSpend.length : null;

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
      avgProfitMarginPct, avgRoas,
    },
    startupFunds,
    warnings,
  });
}

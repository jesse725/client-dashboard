import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { getDb } from './db';
import { authOptions, canViewFinancials } from './auth';
import { listWhopPayments } from './whop';
import { fetchMetaSpendByMonth } from './meta';

// Income & Earnings is Jesse-only, unlike the rest of the admin panel — this is
// the first admin page fully gated (not just individual fields masked).
export async function requireFinancialAccess(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin' || !canViewFinancials(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true };
}

export const WHOP_FEE_RATE = 0.032;
export const DEFAULT_CYCLE_START = '2026-07-01';

export function getCycleStart(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'income_cycle_start'").get() as any;
  return row?.value ?? DEFAULT_CYCLE_START;
}

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function monthBounds(month: string): { since: string; until: string } {
  const [y, m] = month.split('-').map(Number);
  const since = `${month}-01`;
  const until = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
  return { since, until };
}

// Every calendar month from the cycle start through (and including) the current month.
export function listCycleMonths(): string[] {
  const start = getCycleStart();
  const [sy, sm] = start.slice(0, 7).split('-').map(Number);
  const now = new Date();
  const months: string[] = [];
  let y = sy, m = sm;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

interface WhopConfig { apiKey: string; companyId: string }
interface MetaConfig { accessToken: string; adAccountId: string }

function getWhopConfig(): WhopConfig {
  const db = getDb();
  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'whop_api_key'").get() as any;
  const companyIdRow = db.prepare("SELECT value FROM settings WHERE key = 'whop_company_id'").get() as any;
  return { apiKey: apiKeyRow?.value ?? '', companyId: companyIdRow?.value ?? '' };
}

function getMetaConfig(): MetaConfig {
  const db = getDb();
  const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_access_token'").get() as any;
  const accountRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_ad_account_id'").get() as any;
  return { accessToken: tokenRow?.value ?? '', adAccountId: accountRow?.value ?? '' };
}

export interface DataWarning { source: 'whop' | 'meta'; message: string }

// Fetches every Whop payment once and buckets by calendar month — reused across
// however many months a caller needs instead of one API round-trip per month.
export async function getWhopRevenueByMonth(): Promise<{ byMonth: Record<string, number>; warning: DataWarning | null }> {
  const { apiKey, companyId } = getWhopConfig();
  if (!apiKey || !companyId) {
    return { byMonth: {}, warning: { source: 'whop', message: 'Whop is not connected (missing API key or company ID) — connect it in Admin Settings.' } };
  }
  try {
    const payments = await listWhopPayments(apiKey, companyId);
    const byMonth: Record<string, number> = {};
    for (const p of payments) {
      const month = p.createdAt.slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + p.amount;
    }
    return { byMonth, warning: null };
  } catch (e: any) {
    return { byMonth: {}, warning: { source: 'whop', message: `Whop payments fetch failed: ${e.message}` } };
  }
}

export async function getMetaSpendByMonth(since: string, until: string): Promise<{ byMonth: Record<string, number>; warning: DataWarning | null }> {
  const { accessToken, adAccountId } = getMetaConfig();
  if (!accessToken || !adAccountId) {
    return { byMonth: {}, warning: { source: 'meta', message: 'Meta ad account is not connected — connect it in Sales Tracker > Ad Health.' } };
  }
  try {
    const rows = await fetchMetaSpendByMonth(accessToken, adAccountId, since, until);
    const byMonth: Record<string, number> = {};
    for (const r of rows) byMonth[r.month] = r.spend;
    return { byMonth, warning: null };
  } catch (e: any) {
    return { byMonth: {}, warning: { source: 'meta', message: `Meta ad spend fetch failed: ${e.message}` } };
  }
}

export interface ExpenseItem {
  id: number;
  name: string;
  category: 'subscription' | 'payroll' | 'other';
  monthly_amount: number;
  next_review_date: string | null;
  active: number;
}

export function getActiveItems(category?: 'subscription' | 'payroll' | 'other'): ExpenseItem[] {
  const db = getDb();
  if (category) {
    return db.prepare('SELECT * FROM expense_items WHERE active = 1 AND category = ? ORDER BY name').all(category) as ExpenseItem[];
  }
  return db.prepare('SELECT * FROM expense_items WHERE active = 1 ORDER BY category, name').all() as ExpenseItem[];
}

export function sumActiveItems(category: 'subscription' | 'payroll' | 'other'): number {
  return getActiveItems(category).reduce((s, i) => s + i.monthly_amount, 0);
}

export interface ExpenseEntry {
  id: number;
  name: string;
  category: 'other' | 'startup_fund';
  fund_id: number | null;
  amount: number;
  date: string;
  notes: string | null;
}

export function getEntriesForMonth(month: string, category?: 'other' | 'startup_fund'): ExpenseEntry[] {
  const db = getDb();
  const { since, until } = monthBounds(month);
  if (category) {
    return db.prepare('SELECT * FROM expense_entries WHERE date >= ? AND date <= ? AND category = ? ORDER BY date DESC')
      .all(since, until, category) as ExpenseEntry[];
  }
  return db.prepare('SELECT * FROM expense_entries WHERE date >= ? AND date <= ? ORDER BY date DESC')
    .all(since, until) as ExpenseEntry[];
}

export interface MonthPnL {
  month: string;
  label: string;
  revenue: number;
  whopFees: number;
  grossRevenue: number;
  adSpend: number;
  grossProfit: number;
  grossMarginPct: number;
  recurringSubscriptions: number;
  employeeCosts: number;
  startupFundDraws: number;
  otherExpenses: number;
  totalOperatingExpenses: number;
  netProfit: number;
  profitMarginPct: number;
  roas: number | null;
}

export function computeMonthPnL(
  month: string,
  revenue: number,
  adSpend: number,
  recurringSubscriptions: number,
  employeeCosts: number
): MonthPnL {
  const whopFees = revenue * WHOP_FEE_RATE;
  const grossRevenue = revenue - whopFees;
  const grossProfit = grossRevenue - adSpend;
  // Margins are against raw Revenue (pre-Whop-fee), not Gross Revenue — matches
  // the spreadsheet exactly (verified: 10324.86/12650 = 0.8161944664).
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const startupFundDraws = getEntriesForMonth(month, 'startup_fund').reduce((s, e) => s + e.amount, 0);
  const otherExpenses = getEntriesForMonth(month, 'other').reduce((s, e) => s + e.amount, 0);
  // Startup fund draws are one-time seed capital, not ongoing OpEx — the source
  // spreadsheet keeps them out of Total Operating Expenses / Net Profit entirely,
  // tracked separately via the Startup Fund tab instead.
  const totalOperatingExpenses = recurringSubscriptions + employeeCosts + otherExpenses;

  const netProfit = grossProfit - totalOperatingExpenses;
  const profitMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const roas = adSpend > 0 ? revenue / adSpend : null;

  return {
    month,
    label: monthLabel(month),
    revenue,
    whopFees,
    grossRevenue,
    adSpend,
    grossProfit,
    grossMarginPct,
    recurringSubscriptions,
    employeeCosts,
    startupFundDraws,
    otherExpenses,
    totalOperatingExpenses,
    netProfit,
    profitMarginPct,
    roas,
  };
}

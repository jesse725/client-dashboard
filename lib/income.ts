import { getDb } from './db';
import { requireFinancialAccess } from './auth';
import { listWhopPayments } from './whop';
import { fetchMetaSpendByMonth } from './meta';

export { requireFinancialAccess };

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

// Previously excluded payments by guessing Whop's status strings for
// refunded/failed/etc. — that guess is the most likely reason revenue read
// LOW: any status that didn't exactly match Whop's real vocabulary just
// wouldn't be excluded, but a status that accidentally over-matched would
// silently drop real revenue with no way to see it happening. Trusting the
// net amount Whop itself reports (skipping only non-positive ones, which
// can't be revenue either way) removes the guesswork entirely. If a
// specific status genuinely needs excluding later, /api/admin/income/whop-debug
// shows the real status strings and per-status totals to confirm it with
// data instead of another guess.
export async function getWhopRevenueByMonth(): Promise<{ byMonth: Record<string, number>; warning: DataWarning | null }> {
  const { apiKey, companyId } = getWhopConfig();
  if (!apiKey || !companyId) {
    return { byMonth: {}, warning: { source: 'whop', message: 'Whop is not connected (missing API key or company ID) — connect it in Admin Settings.' } };
  }
  try {
    const payments = await listWhopPayments(apiKey, companyId);
    const byMonth: Record<string, number> = {};
    for (const p of payments) {
      if (p.amount <= 0) continue;
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

export type ValueSource = 'live' | 'manual' | 'unavailable';
export type OverrideField = 'revenue' | 'adSpend' | 'payroll' | 'totalOperatingExpenses';

// Manual override for a month's figure — wins over the live/computed value
// when set. Revenue has no live source at all anymore (Whop is disregarded —
// see getMonthlyRevenue below); adSpend still falls back to live Meta;
// payroll/totalOperatingExpenses fall back to the computed roll-up in
// computeMonthPnL.
export function getMonthlyOverrides(field: OverrideField): Record<string, number> {
  const db = getDb();
  const rows = db.prepare('SELECT month, amount FROM income_monthly_overrides WHERE field = ?').all(field) as any[];
  const map: Record<string, number> = {};
  for (const r of rows) map[r.month] = r.amount;
  return map;
}

export function setMonthlyOverride(month: string, field: OverrideField, amount: number) {
  const db = getDb();
  db.prepare(`
    INSERT INTO income_monthly_overrides (month, field, amount) VALUES (?, ?, ?)
    ON CONFLICT(month, field) DO UPDATE SET amount = excluded.amount
  `).run(month, field, amount);
}

export function clearMonthlyOverride(month: string, field: OverrideField) {
  const db = getDb();
  db.prepare('DELETE FROM income_monthly_overrides WHERE month = ? AND field = ?').run(month, field);
}

export function resolveMonthValue(
  month: string,
  liveAmount: number | undefined,
  liveAvailable: boolean,
  overrides: Record<string, number>
): { amount: number; source: ValueSource } {
  if (overrides[month] != null) return { amount: overrides[month], source: 'manual' };
  if (liveAvailable) return { amount: liveAmount ?? 0, source: 'live' };
  return { amount: 0, source: 'unavailable' };
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

export interface ResolvedItem extends ExpenseItem {
  amount: number; // effective amount for the requested month
  isOverride: boolean; // true if this exact month has an explicit entered value
}

// A month with no explicit entry carries forward the most recent prior month's
// value; a month before any entry exists falls back to the item's base rate.
// Editing one month's amount never touches any other month.
function resolveItemAmountForMonth(itemId: number, month: string, baseAmount: number): { amount: number; isOverride: boolean } {
  const db = getDb();
  const exact = db.prepare('SELECT amount FROM expense_monthly_values WHERE item_id = ? AND month = ?').get(itemId, month) as any;
  if (exact) return { amount: exact.amount, isOverride: true };
  const prior = db.prepare('SELECT amount FROM expense_monthly_values WHERE item_id = ? AND month < ? ORDER BY month DESC LIMIT 1').get(itemId, month) as any;
  if (prior) return { amount: prior.amount, isOverride: false };
  return { amount: baseAmount, isOverride: false };
}

export function getResolvedItems(month: string, category?: 'subscription' | 'payroll' | 'other'): ResolvedItem[] {
  return getActiveItems(category).map(item => {
    const { amount, isOverride } = resolveItemAmountForMonth(item.id, month, item.monthly_amount);
    return { ...item, amount, isOverride };
  });
}

export function sumResolvedItems(month: string, category: 'subscription' | 'payroll' | 'other'): number {
  return getResolvedItems(month, category).reduce((s, i) => s + i.amount, 0);
}

export function setItemMonthValue(itemId: number, month: string, amount: number) {
  const db = getDb();
  db.prepare(`
    INSERT INTO expense_monthly_values (item_id, month, amount) VALUES (?, ?, ?)
    ON CONFLICT(item_id, month) DO UPDATE SET amount = excluded.amount
  `).run(itemId, month, amount);
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
  revenue: number; // manually entered — see getMonthlyRevenue; Whop is no longer a source
  revenueSource: ValueSource;
  adSpend: number;
  adSpendSource: ValueSource;
  grossProfit: number;
  grossMarginPct: number;
  recurringSubscriptions: number;
  employeeCosts: number;
  employeeCostsSource: ValueSource;
  otherExpenses: number;
  totalOperatingExpenses: number;
  totalOperatingExpensesSource: ValueSource;
  netProfit: number;
  profitMarginPct: number;
  roas: number | null;
}

export function computeMonthPnL(
  month: string,
  revenue: number,
  adSpend: number,
  recurringSubscriptions: number,
  employeeCosts: number,
  revenueSource: ValueSource = 'manual',
  adSpendSource: ValueSource = 'live',
  // Both optional — a set value wins over the normal computed figure, same
  // "manual overrides win" convention as revenue/adSpend above, just applied
  // to two more line items instead of resolved by the caller beforehand
  // (unlike revenue/adSpend, totalOperatingExpenses is itself composed here
  // from three parts, so its override has to be layered in at this level).
  opts: { payrollOverride?: number; totalOpExOverride?: number } = {}
): MonthPnL {
  const grossProfit = revenue - adSpend;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const otherExpenses = getEntriesForMonth(month, 'other').reduce((s, e) => s + e.amount, 0);
  const effectiveEmployeeCosts = opts.payrollOverride ?? employeeCosts;
  const employeeCostsSource: ValueSource = opts.payrollOverride != null ? 'manual' : 'live';
  const computedTotalOperatingExpenses = recurringSubscriptions + effectiveEmployeeCosts + otherExpenses;
  const totalOperatingExpenses = opts.totalOpExOverride ?? computedTotalOperatingExpenses;
  const totalOperatingExpensesSource: ValueSource = opts.totalOpExOverride != null ? 'manual' : 'live';

  const netProfit = grossProfit - totalOperatingExpenses;
  const profitMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const roas = adSpend > 0 ? revenue / adSpend : null;

  return {
    month,
    label: monthLabel(month),
    revenue,
    revenueSource,
    adSpend,
    adSpendSource,
    grossProfit,
    grossMarginPct,
    recurringSubscriptions,
    employeeCosts: effectiveEmployeeCosts,
    employeeCostsSource,
    otherExpenses,
    totalOperatingExpenses,
    totalOperatingExpensesSource,
    netProfit,
    profitMarginPct,
    roas,
  };
}

// churn/retention rate reconstructed from the only two durable lifecycle
// anchors this app has (clients.start_date, clients.churned_at) — there's no
// month-by-month snapshot history anywhere in this app to read it back from
// directly. See lib/db.ts's churned_at migration for the one disclosed
// accuracy gap: clients already churned before that column existed were
// backfilled to a single date, so their churn is misattributed to that
// month rather than when they actually left. Every churn from then on is
// dated exactly, so this becomes fully accurate going forward.
export interface ChurnRetention {
  activeAtStart: number;
  churnedDuring: number;
  churnRatePct: number | null;
  retentionRatePct: number | null;
}

export function computeChurnRetention(month: string): ChurnRetention {
  const db = getDb();
  const { since, until } = monthBounds(month);

  const activeAtStart = (db.prepare(`
    SELECT COUNT(*) AS c FROM clients
    WHERE onboard_status != 'pending' AND start_date < ? AND (churned_at IS NULL OR churned_at >= ?)
  `).get(since, since) as any).c;

  const churnedDuring = (db.prepare(`
    SELECT COUNT(*) AS c FROM clients
    WHERE onboard_status != 'pending' AND churned_at >= ? AND churned_at <= ?
  `).get(since, until) as any).c;

  const churnRatePct = activeAtStart > 0 ? (churnedDuring / activeAtStart) * 100 : null;
  const retentionRatePct = churnRatePct != null ? 100 - churnRatePct : null;

  return { activeAtStart, churnedDuring, churnRatePct, retentionRatePct };
}

// Portfolio-wide LTV = retainer × confirmed months paid, summed across every
// real client (including churned ones — their LTV is real revenue already
// collected and doesn't disappear because the account later churned).
export function getClientLtvTotal(): number {
  const db = getDb();
  return (db.prepare(`
    SELECT COALESCE(SUM(retainer_price * months_paid), 0) AS total FROM clients
    WHERE onboard_status != 'pending'
  `).get() as any).total;
}

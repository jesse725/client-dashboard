import { getDb } from './db';
import type { Employee, PayPeriodWithTotal } from '@/types';

// ── Payout schedule ─────────────────────────────────────────────────────────
// Semi-monthly: paid on the 14th and 28th of every month (24 payouts/year —
// deliberately NOT the same as true bi-weekly's 26). "Bi-weekly" in the UI is
// just the label the team uses; this file and the schema call it semi-monthly.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-indexed here
}

export type WeekendRule = 'prior_business_day' | 'none';

export function getWeekendRule(): WeekendRule {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'payroll_weekend_rule'").get() as any;
  return (row?.value as WeekendRule) ?? 'prior_business_day';
}

export function setWeekendRule(rule: WeekendRule) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('payroll_weekend_rule', ?)").run(rule);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// If the nominal payout date lands on a weekend, roll back to the prior
// business day (Friday). Configurable — 'none' pays exactly on the nominal date.
function adjustForWeekend(date: Date, rule: WeekendRule): Date {
  if (rule === 'none') return date;
  const d = new Date(date);
  while (isWeekend(d)) d.setDate(d.getDate() - 1);
  return d;
}

export function getPayoutDate(year: number, month: number, nominalDay: 14 | 28, rule: WeekendRule = getWeekendRule()): string {
  const raw = new Date(year, month - 1, nominalDay);
  const adjusted = adjustForWeekend(raw, rule);
  return `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}`;
}

export interface PeriodBounds {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  payoutDate: string; // weekend-adjusted actual date money moves
  nominalDay: 14 | 28;
}

// Which semi-monthly period a given calendar date falls in. Days 1–14 pay out
// on the 14th; days 15–end-of-month pay out on the 28th (periodEnd runs to
// the actual last day of the month — 28/29/30/31 — so no day is ever orphaned
// between periods; only payoutDate stays pinned to the nominal 14th/28th).
export function getPeriodForDate(date: Date, rule: WeekendRule = getWeekendRule()): PeriodBounds {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (day <= 14) {
    return {
      periodStart: `${year}-${pad(month)}-01`,
      periodEnd: `${year}-${pad(month)}-14`,
      payoutDate: getPayoutDate(year, month, 14, rule),
      nominalDay: 14,
    };
  }
  return {
    periodStart: `${year}-${pad(month)}-15`,
    periodEnd: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
    payoutDate: getPayoutDate(year, month, 28, rule),
    nominalDay: 28,
  };
}

// Every period from a start date through today (inclusive) — used to backfill
// any periods an employee should have but doesn't have a row for yet.
export function listPeriodsThrough(startDate: Date, throughDate: Date, rule: WeekendRule = getWeekendRule()): PeriodBounds[] {
  const periods: PeriodBounds[] = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const seen = new Set<string>();
  while (cursor <= throughDate) {
    const p = getPeriodForDate(cursor, rule);
    if (!seen.has(p.payoutDate)) {
      seen.add(p.payoutDate);
      periods.push(p);
    }
    // jump to the first day of the next half
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return periods;
}

export function getActiveEmployees(): Employee[] {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all() as Employee[];
}

export function getEmployeeById(id: number): Employee | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Employee | undefined;
}

export function getEmployeeByEmail(email: string): Employee | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE LOWER(email) = ?').get(email.trim().toLowerCase()) as Employee | undefined;
}

// Ensures a pay_periods row exists for this employee/payout date, snapshotting
// their CURRENT base rate at creation time — later base-rate changes never
// retroactively alter a period that's already been created.
export function ensurePeriod(employeeId: number, bounds: PeriodBounds): number {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM pay_periods WHERE employee_id = ? AND payout_date = ?').get(employeeId, bounds.payoutDate) as any;
  if (existing) return existing.id;

  const employee = getEmployeeById(employeeId);
  const baseAmount = employee?.base_amount_per_period ?? 0;
  const result = db.prepare(
    `INSERT INTO pay_periods (employee_id, period_start, period_end, payout_date, base_amount, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(employeeId, bounds.periodStart, bounds.periodEnd, bounds.payoutDate, baseAmount);
  return result.lastInsertRowid as number;
}

export function getPeriodWithTotal(periodId: number): PayPeriodWithTotal | undefined {
  const db = getDb();
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(periodId) as any;
  if (!period) return undefined;
  const bonusItems = db.prepare('SELECT * FROM pay_period_bonuses WHERE pay_period_id = ? ORDER BY added_at').all(periodId) as any[];
  const totalAmount = period.base_amount + bonusItems.reduce((s, b) => s + b.amount, 0);
  return { ...period, bonusItems, totalAmount };
}

export function getPeriodsForEmployee(employeeId: number): PayPeriodWithTotal[] {
  const db = getDb();
  const periods = db.prepare('SELECT id FROM pay_periods WHERE employee_id = ? ORDER BY payout_date DESC').all(employeeId) as any[];
  return periods.map(p => getPeriodWithTotal(p.id)!).filter(Boolean);
}

// Makes sure the employee has a row for the current period (today) — called
// lazily on read rather than via a background job, matching this app's
// no-cron convention (see initSchema's own seeding pattern).
export function ensureCurrentPeriod(employeeId: number): number {
  const bounds = getPeriodForDate(new Date());
  return ensurePeriod(employeeId, bounds);
}

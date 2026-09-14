import { getDb } from './db';
import { getPeriodForDate, ensurePeriod, getEmployeeById, type PeriodBounds } from './payroll';
import type { EmployeeClientTracking } from '@/types';

const MANAGEMENT_FEE_START_DAYS = 30;
const SCHEDULE_SAFETY_CAP = 600; // 50 years of monthly fees — guards against a malformed launch date

export interface ClientTrackingWithClient extends EmployeeClientTracking {
  clientName: string;
}

export function getTrackingForEmployee(employeeId: number): ClientTrackingWithClient[] {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, c.name AS clientName
    FROM employee_client_tracking t
    JOIN clients c ON c.id = t.client_id
    WHERE t.employee_id = ?
    ORDER BY c.name
  `).all(employeeId) as ClientTrackingWithClient[];
}

export function addClientTracking(employeeId: number, clientId: number): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO employee_client_tracking (employee_id, client_id) VALUES (?, ?)'
  ).run(employeeId, clientId);
  return result.lastInsertRowid as number;
}

export function updateClientTracking(
  id: number,
  updates: { launchedAt?: string | null; active?: boolean }
) {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];
  if ('launchedAt' in updates) { sets.push('launched_at = ?'); values.push(updates.launchedAt || null); }
  if ('active' in updates) { sets.push('active = ?'); values.push(updates.active ? 1 : 0); }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE employee_client_tracking SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function removeClientTracking(id: number) {
  const db = getDb();
  db.prepare('DELETE FROM employee_client_tracking WHERE id = ?').run(id);
}

// ── date helpers ────────────────────────────────────────────────────────────
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return ymd(d);
}
function todayStr(): string {
  return ymd(new Date());
}

// The pay period whose payout date is the first one on or after `dateStr` —
// i.e. "the next paycheck" for something that comes due on that date.
function nextPayoutPeriodOnOrAfter(dateStr: string): PeriodBounds {
  let probe = new Date(dateStr + 'T00:00:00');
  for (let i = 0; i < 4; i++) {
    const bounds = getPeriodForDate(probe);
    if (bounds.payoutDate >= dateStr) return bounds;
    // This period's payday already passed relative to the due date; step into
    // the next half-month and check again.
    probe = new Date(bounds.periodEnd + 'T00:00:00');
    probe.setDate(probe.getDate() + 1);
  }
  return getPeriodForDate(new Date(dateStr + 'T00:00:00'));
}

// Same half of the month (1st–14th vs 15th–EOM), one calendar month on.
// Stepping by whole months keeps the fee on a fixed nominal payout day, so
// with two payouts a month it recurs on every other paycheck.
function periodOneMonthLater(bounds: PeriodBounds): PeriodBounds {
  const [y, m] = bounds.periodStart.split('-').map(Number); // m is 1-indexed
  // new Date's month arg is 0-indexed, so passing the 1-indexed m lands in
  // the next month; the day just needs to fall in the right half.
  const probe = new Date(y, m, bounds.nominalDay === 14 ? 7 : 21);
  return getPeriodForDate(probe);
}

function payoutMonthLabel(payoutDate: string): string {
  const [y, m] = payoutDate.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function onboardLaunchBonusDescription(clientName: string): string {
  return `Onboarding + Launch Bonus — ${clientName}`;
}
function managementFeeDescription(clientName: string, monthLabel: string): string {
  return `Client Management Fee — ${clientName} (${monthLabel})`;
}
function accountFeeDescription(clientName: string): string {
  return `Account Fee — ${clientName}`;
}
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => '\\' + m);
}

// Every monthly-fee period that has already begun as of `asOf` — the first is
// the pay period whose payday is the first on or after launch + 30 days, then
// the same nominal day each month after. Keyed on periodStart (not payday) so
// a fee for the current period shows up as soon as that period opens, i.e.
// while this paycheck is still being prepared, not only once payday lands.
function managementFeeSchedule(launchedAt: string, asOf: string): PeriodBounds[] {
  const out: PeriodBounds[] = [];
  let bounds = nextPayoutPeriodOnOrAfter(addDays(launchedAt, MANAGEMENT_FEE_START_DAYS));
  for (let i = 0; i < SCHEDULE_SAFETY_CAP && bounds.periodStart <= asOf; i++) {
    out.push(bounds);
    bounds = periodOneMonthLater(bounds);
  }
  return out;
}

// Auto-generates the real pay_period_bonuses rows a tracked client roster has
// actually earned as of today. Two independent modes, decided per-employee by
// which rate fields are actually set on their record (never by name) — the
// employee's actual pay structure is the single source of truth for which
// mode applies, not a hardcoded name check:
//
//   • CSM mode (client_onboard_launch_bonus and/or client_management_monthly_
//     fee > 0, e.g. Mo): a one-time bonus on the first paycheck on or after a
//     client's launch date (logging that one date means the onboarding +
//     launch calls are done), then a recurring monthly fee — first one on the
//     first paycheck on or after (launch + 30 days), then the same nominal
//     day every month after, which with semi-monthly payouts is every other
//     paycheck — for as long as the client stays marked active.
//   • Flat per-account mode (per_client_fee > 0 and not CSM mode, e.g. Bolu):
//     just a one-time fee per tracked account, no dates to enter — it fires
//     as soon as the account is added, landing on the next paycheck after
//     that.
//
// A fee whose natural payout already passed (or whose period is already paid)
// is swept onto the current period as a catch-up line instead of reopening a
// closed paycheck; its description still names what it's for.
// Idempotent: matches on the bonus's own description text before adding, so
// running this on every payroll view (like ensureCurrentPeriod) never double-
// charges. Every row it writes is a normal pay_period_bonuses row — visible,
// editable and deletable in the usual bonus UI, tagged added_by 'system'.
export function syncClientManagementPay(employeeId: number) {
  const employee = getEmployeeById(employeeId);
  if (!employee) return;
  const rows = getTrackingForEmployee(employeeId);
  if (rows.length === 0) return;

  const db = getDb();
  const today = todayStr();
  const onboardLaunchBonus = employee.client_onboard_launch_bonus ?? 0;
  const managementFee = employee.client_management_monthly_fee ?? 0;
  const perAccountFee = employee.per_client_fee ?? 0;
  const isCsmMode = onboardLaunchBonus > 0 || managementFee > 0;
  const currentPeriod = getPeriodForDate(new Date(today + 'T00:00:00'));

  const bonusExists = (description: string): boolean =>
    !!db.prepare(`
      SELECT 1 FROM pay_period_bonuses pb
      JOIN pay_periods p ON p.id = pb.pay_period_id
      WHERE p.employee_id = ? AND pb.description = ?
    `).get(employeeId, description);

  const addBonus = (naturalBounds: PeriodBounds, description: string, amount: number) => {
    // Don't attach a charge to a paycheck that's already gone out — sweep it
    // onto the current period instead.
    let bounds = naturalBounds;
    if (bounds.payoutDate < today) {
      bounds = currentPeriod;
    } else {
      const existing = db.prepare(
        'SELECT status FROM pay_periods WHERE employee_id = ? AND payout_date = ?'
      ).get(employeeId, bounds.payoutDate) as any;
      if (existing?.status === 'paid') bounds = currentPeriod;
    }
    const periodId = ensurePeriod(employeeId, bounds);
    db.prepare(
      "INSERT INTO pay_period_bonuses (pay_period_id, description, amount, added_by) VALUES (?, ?, ?, 'system')"
    ).run(periodId, description, amount);
  };

  for (const row of rows) {
    if (!isCsmMode) {
      // Flat per-account mode — no date field in the UI, so the tracking
      // row's own created_at is the trigger: adding the account IS the event.
      if (perAccountFee > 0) {
        const description = accountFeeDescription(row.clientName);
        if (!bonusExists(description)) {
          addBonus(nextPayoutPeriodOnOrAfter(row.created_at.slice(0, 10)), description, perAccountFee);
        }
      }
      continue;
    }

    if (!row.launched_at) continue;

    if (onboardLaunchBonus > 0) {
      const description = onboardLaunchBonusDescription(row.clientName);
      if (!bonusExists(description)) {
        addBonus(nextPayoutPeriodOnOrAfter(row.launched_at), description, onboardLaunchBonus);
      }
    }

    if (row.active && managementFee > 0) {
      for (const bounds of managementFeeSchedule(row.launched_at, today)) {
        const description = managementFeeDescription(row.clientName, payoutMonthLabel(bounds.payoutDate));
        if (!bonusExists(description)) addBonus(bounds, description, managementFee);
      }
    }
  }
}

export interface ClientManagementSummaryRow {
  id: number;
  clientId: number;
  clientName: string;
  launchedAt: string | null;
  active: boolean;
  onboardLaunchBonusEarned: boolean;
  managementPaymentsCharged: number;
  nextPaymentDate: string | null; // next monthly-fee payout not yet reached, for display
  totalEarned: number;
}

// Read-only summary for the tracker UI — grouped by client, unlike the flat
// chronological bonus list. Reads back the REAL amounts already charged (by
// description match against pay_period_bonuses) rather than re-deriving them,
// so it can never disagree with what syncClientManagementPay actually did —
// e.g. a client marked inactive partway through correctly stops adding up
// here too, because no further rows were ever written for it. Same CSM-mode
// vs flat-fee-mode branch as syncClientManagementPay, decided the same way
// (by the employee's own rate fields).
export function getClientManagementSummary(employeeId: number): ClientManagementSummaryRow[] {
  const db = getDb();
  const employee = getEmployeeById(employeeId);
  const rows = getTrackingForEmployee(employeeId);
  const today = todayStr();
  const isCsmMode = (employee?.client_onboard_launch_bonus ?? 0) > 0 || (employee?.client_management_monthly_fee ?? 0) > 0;

  return rows.map(row => {
    if (!isCsmMode) {
      const feeRow = db.prepare(`
        SELECT COALESCE(SUM(pb.amount), 0) AS total FROM pay_period_bonuses pb
        JOIN pay_periods p ON p.id = pb.pay_period_id
        WHERE p.employee_id = ? AND pb.description = ?
      `).get(employeeId, accountFeeDescription(row.clientName)) as any;
      const feeTotal = feeRow?.total ?? 0;
      return {
        id: row.id, clientId: row.client_id, clientName: row.clientName,
        launchedAt: row.launched_at, active: !!row.active,
        onboardLaunchBonusEarned: feeTotal > 0, managementPaymentsCharged: 0, nextPaymentDate: null,
        totalEarned: feeTotal,
      };
    }

    const bonusRow = db.prepare(`
      SELECT COALESCE(SUM(pb.amount), 0) AS total FROM pay_period_bonuses pb
      JOIN pay_periods p ON p.id = pb.pay_period_id
      WHERE p.employee_id = ? AND pb.description = ?
    `).get(employeeId, onboardLaunchBonusDescription(row.clientName)) as any;

    const managementRow = db.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(pb.amount), 0) AS total FROM pay_period_bonuses pb
      JOIN pay_periods p ON p.id = pb.pay_period_id
      WHERE p.employee_id = ? AND pb.description LIKE ? ESCAPE '\\'
    `).get(employeeId, `Client Management Fee — ${escapeLike(row.clientName)} (%`) as any;

    const bonusTotal = bonusRow?.total ?? 0;
    const managementTotal = managementRow?.total ?? 0;

    // The payday of the first monthly-fee period that hasn't opened yet — the
    // "next fee is coming on …" hint. (A fee for a period that HAS opened is
    // already a real line item, counted above.)
    let nextPaymentDate: string | null = null;
    if (row.launched_at && row.active) {
      let bounds = nextPayoutPeriodOnOrAfter(addDays(row.launched_at, MANAGEMENT_FEE_START_DAYS));
      for (let i = 0; i < SCHEDULE_SAFETY_CAP; i++) {
        if (bounds.periodStart > today) { nextPaymentDate = bounds.payoutDate; break; }
        bounds = periodOneMonthLater(bounds);
      }
    }

    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.clientName,
      launchedAt: row.launched_at,
      active: !!row.active,
      onboardLaunchBonusEarned: bonusTotal > 0,
      managementPaymentsCharged: managementRow?.cnt ?? 0,
      nextPaymentDate,
      totalEarned: bonusTotal + managementTotal,
    };
  });
}

import { getDb } from './db';
import { getPeriodForDate, ensurePeriod, getEmployeeById } from './payroll';
import type { EmployeeClientTracking } from '@/types';

const MANAGEMENT_FEE_INTERVAL_DAYS = 30;

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
  updates: { onboardedAt?: string | null; launchedAt?: string | null; active?: boolean }
) {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];
  if ('onboardedAt' in updates) { sets.push('onboarded_at = ?'); values.push(updates.onboardedAt || null); }
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function onboardLaunchBonusDescription(clientName: string): string {
  return `Onboarding + Launch Bonus — ${clientName}`;
}

function managementFeeDescription(clientName: string, monthIndex: number): string {
  return `Client Management Fee — ${clientName} (Month ${monthIndex})`;
}

// Auto-generates the real pay_period_bonuses rows a tracked client roster
// has actually earned so far: a one-time bonus once a client has both an
// onboarded_at and launched_at logged, then a recurring fee every 30 days
// after launch for as long as that client is still marked active (being
// managed). Idempotent — matches on the bonus's own description text before
// adding one, so calling this repeatedly (it runs lazily on every payroll
// view, same as ensureCurrentPeriod elsewhere in this file) never double-
// charges. These are fully real pay_period_bonuses rows once added — visible,
// editable, and deletable in the normal bonus UI like any other bonus, never
// a hidden number that only exists inside this calculation.
export function syncClientManagementPay(employeeId: number) {
  const employee = getEmployeeById(employeeId);
  if (!employee) return;
  const rows = getTrackingForEmployee(employeeId);
  if (rows.length === 0) return;

  const db = getDb();
  const today = todayStr();
  const onboardLaunchBonus = employee.client_onboard_launch_bonus ?? 100;
  const managementFee = employee.client_management_monthly_fee ?? 150;

  const bonusExists = (description: string): boolean => {
    const row = db.prepare(`
      SELECT 1 FROM pay_period_bonuses pb
      JOIN pay_periods p ON p.id = pb.pay_period_id
      WHERE p.employee_id = ? AND pb.description = ?
    `).get(employeeId, description);
    return !!row;
  };

  const addBonus = (dateStr: string, description: string, amount: number) => {
    const bounds = getPeriodForDate(new Date(dateStr + 'T00:00:00'));
    const periodId = ensurePeriod(employeeId, bounds);
    db.prepare(
      "INSERT INTO pay_period_bonuses (pay_period_id, description, amount, added_by) VALUES (?, ?, ?, 'system')"
    ).run(periodId, description, amount);
  };

  for (const row of rows) {
    if (row.onboarded_at && row.launched_at && onboardLaunchBonus > 0) {
      const description = onboardLaunchBonusDescription(row.clientName);
      if (!bonusExists(description)) {
        const laterDate = row.onboarded_at > row.launched_at ? row.onboarded_at : row.launched_at;
        addBonus(laterDate, description, onboardLaunchBonus);
      }
    }

    if (row.launched_at && row.active && managementFee > 0) {
      for (let n = 1; ; n++) {
        const dueDate = addDays(row.launched_at, MANAGEMENT_FEE_INTERVAL_DAYS * n);
        if (dueDate > today) break;
        const description = managementFeeDescription(row.clientName, n);
        if (!bonusExists(description)) addBonus(dueDate, description, managementFee);
      }
    }
  }
}

export interface ClientManagementSummaryRow {
  id: number;
  clientId: number;
  clientName: string;
  onboardedAt: string | null;
  launchedAt: string | null;
  active: boolean;
  onboardLaunchBonusEarned: boolean;
  managementMonthsCharged: number;
  totalEarned: number;
}

// Read-only summary for the tracker UI — grouped by client, unlike the flat
// chronological bonus list. Deliberately reads back the REAL amounts already
// charged (via description match against pay_period_bonuses) rather than
// re-deriving "months elapsed" independently, so this can never show a
// number that doesn't match what syncClientManagementPay actually did —
// e.g. a client marked inactive partway through correctly stops accruing
// new months here too, because no new rows were ever added for it.
export function getClientManagementSummary(employeeId: number): ClientManagementSummaryRow[] {
  const db = getDb();
  const rows = getTrackingForEmployee(employeeId);

  return rows.map(row => {
    const bonusRow = db.prepare(`
      SELECT COALESCE(SUM(pb.amount), 0) AS total FROM pay_period_bonuses pb
      JOIN pay_periods p ON p.id = pb.pay_period_id
      WHERE p.employee_id = ? AND pb.description = ?
    `).get(employeeId, onboardLaunchBonusDescription(row.clientName)) as any;

    const managementRow = db.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(pb.amount), 0) AS total FROM pay_period_bonuses pb
      JOIN pay_periods p ON p.id = pb.pay_period_id
      WHERE p.employee_id = ? AND pb.description LIKE ?
    `).get(employeeId, `Client Management Fee — ${row.clientName} (Month %`) as any;

    const bonusTotal = bonusRow?.total ?? 0;
    const managementTotal = managementRow?.total ?? 0;

    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.clientName,
      onboardedAt: row.onboarded_at,
      launchedAt: row.launched_at,
      active: !!row.active,
      onboardLaunchBonusEarned: bonusTotal > 0,
      managementMonthsCharged: managementRow?.cnt ?? 0,
      totalEarned: bonusTotal + managementTotal,
    };
  });
}

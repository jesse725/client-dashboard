import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Distinct payout dates that have at least one pay period, newest first —
// backs the export picker so the admin isn't limited to just the current one.
export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const rows = db.prepare(`
    SELECT payout_date,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount
    FROM pay_periods
    GROUP BY payout_date
    ORDER BY payout_date DESC
  `).all();

  return NextResponse.json({ payoutDates: rows });
}

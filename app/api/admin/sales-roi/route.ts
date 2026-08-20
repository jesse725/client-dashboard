import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Ties the sales pipeline's ad spend/CAC to what those acquired clients are
// actually worth. The whole Sales Tracker is Jesse-only now, so this no
// longer needs its own partial-mask — requireFinancialAccess blocks the
// entire route the same as every other sales-* endpoint.
export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const clients = db.prepare(
    `SELECT retainer_price, start_date, client_status FROM clients WHERE onboard_status != 'pending'`
  ).all() as { retainer_price: number; start_date: string; client_status: string }[];

  const active = clients.filter(c => c.client_status !== 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);
  const avgMonthlyRetainer = active.length > 0 ? totalMRR / active.length : 0;

  const monthsWorked = (startDate: string) => {
    const start = new Date(startDate);
    const now = new Date();
    return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
  };
  const totalLTV = clients.reduce((s, c) => s + (c.retainer_price || 0) * monthsWorked(c.start_date), 0);

  return NextResponse.json({
    hidden: false,
    activeClients: active.length,
    totalClients: clients.length,
    totalMRR,
    totalLTV,
    avgMonthlyRetainer,
  });
}

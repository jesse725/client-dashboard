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
    `SELECT retainer_price, client_status, months_paid FROM clients WHERE onboard_status != 'pending'`
  ).all() as { retainer_price: number; client_status: string; months_paid: number }[];

  const active = clients.filter(c => c.client_status !== 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);
  const avgMonthlyRetainer = active.length > 0 ? totalMRR / active.length : 0;

  // LTV = retainer × confirmed months paid (the Kanban "Month N" stage an
  // admin moved this client's card to — see lib/db.ts's months_paid
  // migration), not elapsed calendar time. Same formula as Client Success
  // and the Income Statement, so this card can't quietly disagree with them.
  const totalLTV = clients.reduce((s, c) => s + (c.retainer_price || 0) * (c.months_paid || 0), 0);

  return NextResponse.json({
    hidden: false,
    activeClients: active.length,
    totalClients: clients.length,
    totalMRR,
    totalLTV,
    avgMonthlyRetainer,
  });
}

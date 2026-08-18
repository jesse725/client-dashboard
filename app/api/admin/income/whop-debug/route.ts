import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireFinancialAccess } from '@/lib/income';
import { listWhopPayments } from '@/lib/whop';

// Diagnostic: raw Whop payment records with a status breakdown, so revenue
// discrepancies can be checked against real data instead of guessed at.
export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'whop_api_key'").get() as any)?.value ?? '';
  const companyId = (db.prepare("SELECT value FROM settings WHERE key = 'whop_company_id'").get() as any)?.value ?? '';
  if (!apiKey || !companyId) return NextResponse.json({ error: 'Whop not configured' }, { status: 400 });

  const payments = await listWhopPayments(apiKey, companyId);

  const byStatus: Record<string, { count: number; netTotal: number; grossTotal: number }> = {};
  for (const p of payments) {
    const s = (p.status ?? 'unknown').toLowerCase();
    if (!byStatus[s]) byStatus[s] = { count: 0, netTotal: 0, grossTotal: 0 };
    byStatus[s].count += 1;
    byStatus[s].netTotal += p.amount;
    byStatus[s].grossTotal += p.grossAmount;
  }

  const allTimeNet = payments.reduce((s, p) => s + p.amount, 0);
  const allTimeGross = payments.reduce((s, p) => s + p.grossAmount, 0);

  return NextResponse.json({
    totalPayments: payments.length,
    allTimeNet,
    allTimeGross,
    byStatus,
    payments: payments
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(p => ({ id: p.id, status: p.status, netAmount: p.amount, grossAmount: p.grossAmount, date: p.createdAt.slice(0, 10), email: p.email })),
  });
}

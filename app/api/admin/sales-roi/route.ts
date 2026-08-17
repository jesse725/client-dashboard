import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, canViewFinancials } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Ties the sales pipeline's ad spend/CAC to what those acquired clients are
// actually worth — same Jesse-only masking as retainer/MRR everywhere else,
// since this is derived directly from retainer_price.
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canViewFinancials(user.email)) {
    return NextResponse.json({ hidden: true });
  }

  const db = getDb();
  const clients = db.prepare(
    `SELECT retainer_price, start_date, client_status FROM clients WHERE onboard_status != 'pending'`
  ).all() as { retainer_price: number; start_date: string; client_status: string }[];

  const active = clients.filter(c => c.client_status !== 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);

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
  });
}

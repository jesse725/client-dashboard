import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listWhopMemberships, fetchWhopMembership } from '@/lib/whop';

// Diagnostic: list every Whop membership matching an email, with full detail.
// Useful when a client has multiple memberships and the "wrong" one seems to
// be winning during sync.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email query param required' }, { status: 400 });

  const db = getDb();
  const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'whop_api_key'").get() as any)?.value ?? '';
  const companyId = (db.prepare("SELECT value FROM settings WHERE key = 'whop_company_id'").get() as any)?.value ?? '';
  if (!apiKey || !companyId) return NextResponse.json({ error: 'Whop not configured' }, { status: 400 });

  const all = await listWhopMemberships(apiKey, companyId);
  const matches = all.filter(m => m.email?.trim().toLowerCase() === email);

  const detailed = await Promise.all(matches.map(async m => {
    try {
      const detail = await fetchWhopMembership(apiKey, m.id);
      return { id: m.id, status: m.status, renewal_period_end: detail.renewalPeriodEnd };
    } catch (e: any) {
      return { id: m.id, status: m.status, error: e.message };
    }
  }));

  return NextResponse.json({ email, count: detailed.length, memberships: detailed });
}

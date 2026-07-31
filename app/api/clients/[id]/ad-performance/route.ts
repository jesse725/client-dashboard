import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getClientAdPerformance } from '@/lib/adPerformance';
import { Client } from '@/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client;
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!client.meta_access_token || !client.meta_ad_account_id) {
    return NextResponse.json({ ads: [], reason: 'meta_not_connected' });
  }

  try {
    const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
    const perf = await getClientAdPerformance(client, agencyKey);
    return NextResponse.json({ ads: perf.ads });
  } catch (e: any) {
    return NextResponse.json({ ads: [], error: e.message }, { status: 200 });
  }
}

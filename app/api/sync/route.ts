import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { runGHLSync } from '@/lib/sync';

export async function POST() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await runGHLSync();
  return NextResponse.json(result);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const logs = db
    .prepare('SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 20')
    .all();
  const lastSync = (db.prepare(`SELECT value FROM settings WHERE key = 'last_sync'`).get() as any)?.value ?? null;

  return NextResponse.json({ logs, lastSync });
}

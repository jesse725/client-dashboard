import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireFinancialAccess } from '@/lib/income';

export async function GET() {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const funds = db.prepare('SELECT * FROM startup_funds ORDER BY id').all();
  return NextResponse.json({ funds });
}

export async function POST(req: Request) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { name, allocated, notes } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare('INSERT INTO startup_funds (name, allocated, notes) VALUES (?, ?, ?)')
    .run(name, Number(allocated) || 0, notes || null);
  return NextResponse.json({ id: result.lastInsertRowid });
}

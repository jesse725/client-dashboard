import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const users = db
    .prepare('SELECT id, email, name, role, client_id, created_at FROM users ORDER BY name')
    .all();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  const hash = await bcrypt.hash(body.password, 10);
  const result = db
    .prepare(
      'INSERT INTO users (email, password_hash, role, name, client_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(body.email, hash, body.role, body.name, body.client_id ?? null);

  const created = db
    .prepare('SELECT id, email, name, role, client_id FROM users WHERE id = ?')
    .get(result.lastInsertRowid);
  return NextResponse.json(created, { status: 201 });
}

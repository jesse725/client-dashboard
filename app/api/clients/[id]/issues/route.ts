import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const issues = db.prepare(
    'SELECT * FROM issues_solutions WHERE client_id = ? ORDER BY date DESC, id DESC'
  ).all(id);
  return NextResponse.json(issues);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { date, issue, solution, status } = body;
  if (!issue?.trim()) return NextResponse.json({ error: 'issue is required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO issues_solutions (client_id, date, issue, solution, status) VALUES (?, ?, ?, ?, ?)`
  ).run(id, date || new Date().toISOString().slice(0, 10), issue.trim(), solution?.trim() || null, status || 'open');

  const row = db.prepare('SELECT * FROM issues_solutions WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(row, { status: 201 });
}

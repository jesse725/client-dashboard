import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const { id, issueId } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();
  const fields = ['date', 'issue', 'solution', 'status'];
  const updates = fields.filter(f => f in body);
  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const set = updates.map(f => `${f} = ?`).join(', ');
  const values = updates.map(f => body[f]);
  db.prepare(`UPDATE issues_solutions SET ${set} WHERE id = ? AND client_id = ?`).run(...values, issueId, id);

  const row = db.prepare('SELECT * FROM issues_solutions WHERE id = ?').get(issueId);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const { id, issueId } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  db.prepare('DELETE FROM issues_solutions WHERE id = ? AND client_id = ?').run(issueId, id);
  return NextResponse.json({ ok: true });
}

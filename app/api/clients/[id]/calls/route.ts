import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function canAccess(clientId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return false;
  const user = session.user as any;
  return user?.role === 'admin' || String(user?.clientId) === clientId;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAccess(id))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const calls = db.prepare(`
    SELECT * FROM call_notes WHERE client_id = ? ORDER BY
      CASE call_type WHEN 'sales' THEN 1 WHEN 'onboarding' THEN 2 WHEN 'launch' THEN 3 ELSE 4 END,
      call_number ASC
  `).all(id);

  return NextResponse.json(calls.map((c: any) => ({
    ...c,
    issues_solutions: JSON.parse(c.issues_solutions || '[]'),
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  // Auto-number check-ins
  let callNumber = 1;
  if (body.call_type === 'checkin') {
    const count = (db.prepare('SELECT COUNT(*) as n FROM call_notes WHERE client_id = ? AND call_type = ?').get(id, 'checkin') as any).n;
    callNumber = count + 1;
  }

  const result = db.prepare(`
    INSERT INTO call_notes (client_id, call_type, call_date, call_number, fathom_summary, pain_points, goals, solutions_tried, issues_solutions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.call_type,
    body.call_date || new Date().toISOString().slice(0, 10),
    callNumber,
    body.fathom_summary || null,
    body.pain_points || null,
    body.goals || null,
    body.solutions_tried || null,
    JSON.stringify(body.issues_solutions || []),
  );

  const created = db.prepare('SELECT * FROM call_notes WHERE id = ?').get(result.lastInsertRowid) as any;
  return NextResponse.json({ ...created, issues_solutions: JSON.parse(created.issues_solutions || '[]') }, { status: 201 });
}

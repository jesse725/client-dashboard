import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const { callId } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const db = getDb();

  db.prepare(`
    UPDATE call_notes SET
      call_date            = COALESCE(?, call_date),
      fathom_summary       = COALESCE(?, fathom_summary),
      pain_points          = COALESCE(?, pain_points),
      goals                = COALESCE(?, goals),
      solutions_tried      = COALESCE(?, solutions_tried),
      issues_solutions     = COALESCE(?, issues_solutions),
      problems_addressed   = COALESCE(?, problems_addressed),
      next_step_actions    = COALESCE(?, next_step_actions),
      problems_resolved    = COALESCE(?, problems_resolved),
      wins                 = COALESCE(?, wins),
      client_sentiment     = COALESCE(?, client_sentiment),
      agency_action_items  = COALESCE(?, agency_action_items),
      client_action_items  = COALESCE(?, client_action_items),
      updated_at           = datetime('now')
    WHERE id = ?
  `).run(
    body.call_date ?? null,
    body.fathom_summary ?? null,
    body.pain_points ?? null,
    body.goals ?? null,
    body.solutions_tried ?? null,
    body.issues_solutions ? JSON.stringify(body.issues_solutions) : null,
    body.problems_addressed ?? null,
    body.next_step_actions ?? null,
    body.problems_resolved ?? null,
    body.wins ?? null,
    body.client_sentiment ?? null,
    body.agency_action_items ?? null,
    body.client_action_items ?? null,
    callId,
  );

  const updated = db.prepare('SELECT * FROM call_notes WHERE id = ?').get(callId) as any;
  return NextResponse.json({ ...updated, issues_solutions: JSON.parse(updated.issues_solutions || '[]') });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const { callId } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  db.prepare('DELETE FROM call_notes WHERE id = ?').run(callId);
  return NextResponse.json({ ok: true });
}

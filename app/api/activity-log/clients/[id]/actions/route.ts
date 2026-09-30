import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ACTION_TYPES } from '@/lib/activityLog';

// One "What I'm Doing" action for this client review. A client can have
// several — the media buyer can call + Add Action more than once.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const review = db.prepare(`
    SELECT alc.review_status, al.status AS log_status
    FROM activity_log_clients alc JOIN activity_logs al ON al.id = alc.activity_log_id
    WHERE alc.id = ?
  `).get(id) as any;
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.log_status === 'submitted') {
    return NextResponse.json({ error: 'This log has been submitted and is read-only.' }, { status: 400 });
  }
  if (review.review_status === 'locked') {
    return NextResponse.json({ error: 'This client is locked. An admin can unlock it if it needs changes.' }, { status: 400 });
  }

  const { actionType, actionTaken, reason, expectedResult, followUpDate } = await req.json();
  if (!ACTION_TYPES.includes(actionType)) return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 });
  if (!actionTaken || !String(actionTaken).trim()) {
    return NextResponse.json({ error: 'Action Taken is required' }, { status: 400 });
  }

  const result = db.prepare(`
    INSERT INTO activity_log_actions (activity_log_client_id, action_type, action_taken, reason, expected_result, follow_up_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, actionType, String(actionTaken).trim(), reason || null, expectedResult || null, followUpDate || null);

  return NextResponse.json(db.prepare('SELECT * FROM activity_log_actions WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
}

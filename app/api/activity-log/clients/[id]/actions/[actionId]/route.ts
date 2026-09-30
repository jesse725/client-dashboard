import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Removes one action — only while its client review is still unlocked.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; actionId: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id, actionId } = await params;
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

  db.prepare('DELETE FROM activity_log_actions WHERE id = ? AND activity_log_client_id = ?').run(actionId, id);
  return NextResponse.json({ ok: true });
}

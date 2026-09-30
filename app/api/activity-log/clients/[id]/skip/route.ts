import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Marks a reviewed-in-name-only client as explicitly skipped, with a reason —
// the Submit validation accepts this as an alternative to a locked review.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { reason } = await req.json();
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: 'A reason is required to skip a client' }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'This client is already locked.' }, { status: 400 });
  }

  db.prepare(
    `UPDATE activity_log_clients SET review_status = 'skipped', skip_reason = ? WHERE id = ?`
  ).run(String(reason).trim(), id);

  return NextResponse.json(db.prepare('SELECT * FROM activity_log_clients WHERE id = ?').get(id));
}

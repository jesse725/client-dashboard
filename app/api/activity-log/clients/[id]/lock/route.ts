import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// "LOCK CLIENT UPDATE" — the point of no return for this client's review.
// Requires exactly what the spec's Submit validation later re-checks anyway
// (health set, observation written, at least one action) so a bad lock can't
// slip through and only get caught at the very end of the day.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const review = db.prepare(`
    SELECT alc.*, al.status AS log_status
    FROM activity_log_clients alc JOIN activity_logs al ON al.id = alc.activity_log_id
    WHERE alc.id = ?
  `).get(id) as any;
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.log_status === 'submitted') {
    return NextResponse.json({ error: 'This log has been submitted and is read-only.' }, { status: 400 });
  }
  if (review.review_status === 'locked') {
    return NextResponse.json({ error: 'Already locked' }, { status: 400 });
  }

  const missing: string[] = [];
  if (!review.campaign_health) missing.push('Campaign Health');
  if (!review.observation || !review.observation.trim()) missing.push('"What I\'m Seeing"');
  const actionCount = (db.prepare('SELECT COUNT(*) AS c FROM activity_log_actions WHERE activity_log_client_id = ?').get(id) as any).c;
  if (actionCount === 0) missing.push('at least one Action');
  if (missing.length > 0) {
    return NextResponse.json({ error: `Before locking, this client still needs: ${missing.join(', ')}.` }, { status: 400 });
  }

  db.prepare(`UPDATE activity_log_clients SET review_status = 'locked', locked_at = datetime('now') WHERE id = ?`).run(id);
  return NextResponse.json(db.prepare('SELECT * FROM activity_log_clients WHERE id = ?').get(id));
}

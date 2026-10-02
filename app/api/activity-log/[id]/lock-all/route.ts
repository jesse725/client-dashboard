import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// "Lock All" — locks every still-in-progress client review on this log that
// already satisfies the single-client lock's own requirements (health set,
// observation written, at least one action), in one pass, instead of
// clicking "Lock Client Update" on each one individually. Anything not
// ready is left alone and reported back, never force-locked.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const log = db.prepare('SELECT status FROM activity_logs WHERE id = ?').get(id) as any;
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (log.status === 'submitted') {
    return NextResponse.json({ error: 'This log has been submitted and is read-only.' }, { status: 400 });
  }

  const candidates = db.prepare(
    `SELECT * FROM activity_log_clients WHERE activity_log_id = ? AND review_status = 'in_progress'`
  ).all(id) as any[];

  const locked: string[] = [];
  const skipped: { name: string; missing: string[] }[] = [];

  for (const review of candidates) {
    const missing: string[] = [];
    if (!review.campaign_health) missing.push('Campaign Health');
    if (!review.observation || !review.observation.trim()) missing.push('"What I\'m Seeing"');
    const actionCount = (db.prepare(
      'SELECT COUNT(*) AS c FROM activity_log_actions WHERE activity_log_client_id = ?'
    ).get(review.id) as any).c;
    if (actionCount === 0) missing.push('at least one Action');

    if (missing.length > 0) {
      skipped.push({ name: review.client_name, missing });
      continue;
    }
    db.prepare(`UPDATE activity_log_clients SET review_status = 'locked', locked_at = datetime('now') WHERE id = ?`).run(review.id);
    locked.push(review.client_name);
  }

  return NextResponse.json({ lockedCount: locked.length, locked, skipped });
}

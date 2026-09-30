import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Admin-only. Reopens health/observation/actions for editing — it never
// touches the frozen metric snapshot rows, and every unlock is permanently
// recorded here, even though it isn't shown inline in the log itself.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { reason } = await req.json().catch(() => ({ reason: null }));
  const db = getDb();
  const review = db.prepare('SELECT review_status FROM activity_log_clients WHERE id = ?').get(id) as any;
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.review_status !== 'locked') {
    return NextResponse.json({ error: 'This client isn\'t locked' }, { status: 400 });
  }

  db.transaction(() => {
    db.prepare(`UPDATE activity_log_clients SET review_status = 'in_progress', locked_at = NULL WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO activity_log_unlock_audit (activity_log_client_id, unlocked_by, reason) VALUES (?, ?, ?)`
    ).run(id, user.email ?? user.name ?? 'unknown', reason || null);
  })();

  return NextResponse.json(db.prepare('SELECT * FROM activity_log_clients WHERE id = ?').get(id));
}

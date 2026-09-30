import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Every rule from the spec's Submit section, checked server-side (never just
// hidden/disabled in the UI): every active client reviewed-or-skipped, every
// reviewed client locked, Daily Summary complete. Health/observation/action
// completeness is already guaranteed per-client by the lock route, so this
// doesn't re-check those directly — it checks that locking actually happened.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const log = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id) as any;
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (log.status === 'submitted') return NextResponse.json({ error: 'Already submitted' }, { status: 400 });

  const missing: string[] = [];

  const activeClients = db.prepare(
    `SELECT id, name FROM clients WHERE onboard_status = 'active' AND client_status != 'Churned'`
  ).all() as { id: number; name: string }[];
  const reviews = db.prepare(
    'SELECT client_id, review_status FROM activity_log_clients WHERE activity_log_id = ?'
  ).all(id) as { client_id: number | null; review_status: string }[];
  const reviewByClient = new Map(reviews.filter((r) => r.client_id != null).map((r) => [r.client_id, r.review_status]));

  const notHandled = activeClients.filter((c) => {
    const status = reviewByClient.get(c.id);
    return status !== 'locked' && status !== 'skipped';
  });
  if (notHandled.length > 0) {
    missing.push(`${notHandled.length} client${notHandled.length === 1 ? '' : 's'} not reviewed or skipped (${notHandled.map((c) => c.name).join(', ')})`);
  }

  if (!log.overall_performance || !log.overall_performance.trim()) missing.push('Overall Performance summary');
  if (!log.biggest_priorities || !log.biggest_priorities.trim()) missing.push('Biggest Priorities / Concerns');
  if (!log.creative_testing_plan || !log.creative_testing_plan.trim()) missing.push('Creative / Testing Plan');

  if (missing.length > 0) {
    return NextResponse.json({ error: 'Cannot submit yet.', missing }, { status: 400 });
  }

  db.prepare(`UPDATE activity_logs SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?`).run(id);
  return NextResponse.json(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id));
}

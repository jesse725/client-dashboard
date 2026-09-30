import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Full detail: the log itself, every client review on it, each review's 3
// frozen metric-window snapshots, and its actions — everything the editor/
// viewer page needs in one call.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const log = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id);
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const clientRows = db.prepare(
    'SELECT * FROM activity_log_clients WHERE activity_log_id = ? ORDER BY id'
  ).all(id) as any[];

  const clients = clientRows.map((c) => ({
    ...c,
    snapshots: db.prepare(
      'SELECT * FROM activity_log_metric_snapshots WHERE activity_log_client_id = ? ORDER BY window_days'
    ).all(c.id),
    actions: db.prepare(
      'SELECT * FROM activity_log_actions WHERE activity_log_client_id = ? ORDER BY created_at'
    ).all(c.id),
  }));

  // Active clients not yet on this log — for the "+ Add Client" dropdown.
  // Queried directly here (not GET /api/clients) because that route only
  // serves a full roster to role==='admin' sessions; a pure employee-role
  // login (the media buyer, unlinked to an admin account) would otherwise
  // get back an empty list.
  const addedIds = new Set(clientRows.map((c) => c.client_id));
  const eligibleClients = (db.prepare(
    `SELECT id, name FROM clients WHERE onboard_status = 'active' AND client_status != 'Churned' ORDER BY name`
  ).all() as { id: number; name: string }[]).filter((c) => !addedIds.has(c.id));

  return NextResponse.json({ log, clients, eligibleClients });
}

const SUMMARY_FIELDS: Record<string, string> = {
  overallPerformance: 'overall_performance',
  biggestPriorities: 'biggest_priorities',
  creativeTestingPlan: 'creative_testing_plan',
};

// Daily Summary's 3 fields — only while the log is still a draft.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const log = db.prepare('SELECT status FROM activity_logs WHERE id = ?').get(id) as any;
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (log.status === 'submitted') {
    return NextResponse.json({ error: 'This log has been submitted and is read-only.' }, { status: 400 });
  }

  const body = await req.json();
  const sets: string[] = [];
  const values: any[] = [];
  for (const [field, column] of Object.entries(SUMMARY_FIELDS)) {
    if (field in body) { sets.push(`${column} = ?`); values.push(body[field]); }
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  values.push(id);
  db.prepare(`UPDATE activity_logs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id));
}

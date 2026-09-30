import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

// One row per active client: health/date/action from their most recent
// LOCKED review on a SUBMITTED log (a draft-in-progress doesn't count as
// reviewed yet) — plus the counts the owner view's summary strip needs.
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const activeClients = db.prepare(
    `SELECT id, name FROM clients WHERE onboard_status = 'active' AND client_status != 'Churned' ORDER BY name`
  ).all() as { id: number; name: string }[];

  const rows = activeClients.map((c) => {
    const latest = db.prepare(`
      SELECT alc.id, alc.campaign_health, alc.locked_at, al.log_date, al.submitted_at
      FROM activity_log_clients alc
      JOIN activity_logs al ON al.id = alc.activity_log_id
      WHERE alc.client_id = ? AND alc.review_status = 'locked' AND al.status = 'submitted'
      ORDER BY al.log_date DESC, alc.locked_at DESC
      LIMIT 1
    `).get(c.id) as any;

    if (!latest) {
      return { clientId: c.id, clientName: c.name, health: null, lastReview: null, lastAction: null };
    }

    const lastAction = db.prepare(
      'SELECT action_type FROM activity_log_actions WHERE activity_log_client_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(latest.id) as any;

    return {
      clientId: c.id, clientName: c.name,
      health: latest.campaign_health,
      lastReview: latest.log_date,
      lastAction: lastAction?.action_type ?? null,
    };
  });

  const counts = {
    healthy: rows.filter((r) => r.health === 'healthy').length,
    needsAttention: rows.filter((r) => r.health === 'needs_attention').length,
    actionRequired: rows.filter((r) => r.health === 'action_required').length,
    notReviewed: rows.filter((r) => r.health == null).length,
  };

  return NextResponse.json({ rows, counts });
}

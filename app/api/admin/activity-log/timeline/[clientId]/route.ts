import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

// Every locked review this client has ever had, across every SUBMITTED log,
// oldest first — the "did the buyer's decisions actually help" timeline.
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { clientId } = await params;
  const db = getDb();

  const reviews = db.prepare(`
    SELECT alc.*, al.log_date, al.day_of_week, al.media_buyer_name
    FROM activity_log_clients alc
    JOIN activity_logs al ON al.id = alc.activity_log_id
    WHERE alc.client_id = ? AND alc.review_status = 'locked' AND al.status = 'submitted'
    ORDER BY al.log_date ASC
  `).all(clientId) as any[];

  const timeline = reviews.map((r) => ({
    ...r,
    snapshots: db.prepare(
      'SELECT * FROM activity_log_metric_snapshots WHERE activity_log_client_id = ? ORDER BY window_days'
    ).all(r.id),
    actions: db.prepare(
      'SELECT * FROM activity_log_actions WHERE activity_log_client_id = ? ORDER BY created_at'
    ).all(r.id),
  }));

  return NextResponse.json({ timeline });
}

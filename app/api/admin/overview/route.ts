import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  const clients = db.prepare(`
    SELECT
      c.*,
      COUNT(q.id)                                                                AS total_quotes,
      COALESCE(SUM(q.value), 0)                                                  AS total_quoted_value,
      COUNT(CASE WHEN q.status = 'closed' THEN 1 END)                            AS closed_deals,
      COALESCE(SUM(CASE WHEN q.status = 'closed' THEN q.value ELSE 0 END), 0)   AS revenue_closed,
      CAST((julianday('now') - julianday(c.start_date)) AS INTEGER)              AS days_as_client,
      ROUND(
        (julianday('now') - julianday(c.start_date)) / 30.0
      ) * COALESCE(c.retainer_price, 0)                                          AS total_payments_received
    FROM clients c
    LEFT JOIN quotes q ON q.client_id = c.id
    WHERE c.onboard_status != 'pending'
    GROUP BY c.id
    ORDER BY c.start_date DESC
  `).all();

  return NextResponse.json(clients);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, client_status, internal_notes, checkin_count, testimonial_collected } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getDb();
  db.prepare(`
    UPDATE clients SET
      client_status         = COALESCE(?, client_status),
      internal_notes        = COALESCE(?, internal_notes),
      checkin_count         = COALESCE(?, checkin_count),
      testimonial_collected = COALESCE(?, testimonial_collected)
    WHERE id = ?
  `).run(
    client_status ?? null,
    internal_notes ?? null,
    checkin_count ?? null,
    testimonial_collected ?? null,
    id
  );

  return NextResponse.json({ ok: true });
}

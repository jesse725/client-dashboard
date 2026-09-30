import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { captureClientSnapshot } from '@/lib/activityLog';
import { Client } from '@/types';

// Runs `fn` over `items` with at most `limit` in flight — same pattern
// app/api/admin/overview/route.ts already uses, so a full-roster snapshot
// pass doesn't fire every client's Meta calls at once.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

// "Review All Active Clients" — adds every active client not already on this
// log, same snapshot capture as adding one at a time.
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

  const alreadyIds = new Set(
    (db.prepare('SELECT client_id FROM activity_log_clients WHERE activity_log_id = ?').all(id) as any[]).map((r) => r.client_id)
  );
  const activeClients = (db.prepare(
    `SELECT * FROM clients WHERE onboard_status = 'active' AND client_status != 'Churned'`
  ).all() as Client[]).filter((c) => !alreadyIds.has(c.id));

  if (activeClients.length === 0) {
    return NextResponse.json({ added: 0, clients: [] });
  }

  const agencyGhlKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
  const snapshotsByClient = await mapLimit(activeClients, 4, async (c) => ({
    client: c,
    snapshots: await captureClientSnapshot(c, agencyGhlKey),
  }));

  const insertReview = db.prepare(`
    INSERT INTO activity_log_clients (activity_log_id, client_id, client_name, snapshot_taken_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO activity_log_metric_snapshots
      (activity_log_client_id, window_days, spend, leads, cpl, appointments, cost_per_appointment, booking_rate, ctr, cpc, cpm, frequency)
    VALUES (@id, @windowDays, @spend, @leads, @cpl, @appointments, @costPerAppointment, @bookingRate, @ctr, @cpc, @cpm, @frequency)
  `);

  const reviewIds = db.transaction(() => {
    return snapshotsByClient.map(({ client, snapshots }) => {
      const result = insertReview.run(id, client.id, client.name);
      const newId = result.lastInsertRowid as number;
      for (const s of snapshots) insertSnapshot.run({ id: newId, ...s });
      return newId;
    });
  })();

  const clients = reviewIds.map((reviewId) => ({
    ...(db.prepare('SELECT * FROM activity_log_clients WHERE id = ?').get(reviewId) as object),
    snapshots: db.prepare('SELECT * FROM activity_log_metric_snapshots WHERE activity_log_client_id = ? ORDER BY window_days').all(reviewId),
  }));

  return NextResponse.json({ added: clients.length, clients });
}

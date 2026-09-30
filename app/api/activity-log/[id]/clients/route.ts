import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { captureClientSnapshot } from '@/lib/activityLog';
import { Client } from '@/types';

// Adds one client to the log and immediately captures its permanent 3/7/30-
// day snapshot — the snapshot is taken HERE, once, and never touched again
// by anything else in this feature.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const log = db.prepare('SELECT status FROM activity_logs WHERE id = ?').get(id) as any;
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (log.status === 'submitted') {
    return NextResponse.json({ error: 'This log has been submitted and is read-only.' }, { status: 400 });
  }

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Client | undefined;
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const already = db.prepare(
    'SELECT id FROM activity_log_clients WHERE activity_log_id = ? AND client_id = ?'
  ).get(id, clientId);
  if (already) return NextResponse.json({ error: 'That client is already on this log' }, { status: 409 });

  const agencyGhlKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
  const snapshots = await captureClientSnapshot(client, agencyGhlKey);

  const insertReview = db.prepare(`
    INSERT INTO activity_log_clients (activity_log_id, client_id, client_name, snapshot_taken_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO activity_log_metric_snapshots
      (activity_log_client_id, window_days, spend, leads, cpl, appointments, cost_per_appointment, booking_rate, ctr, cpc, cpm, frequency)
    VALUES (@id, @windowDays, @spend, @leads, @cpl, @appointments, @costPerAppointment, @bookingRate, @ctr, @cpc, @cpm, @frequency)
  `);

  const reviewId = db.transaction(() => {
    const result = insertReview.run(id, clientId, client.name);
    const newId = result.lastInsertRowid as number;
    for (const s of snapshots) insertSnapshot.run({ id: newId, ...s });
    return newId;
  })();

  const review = db.prepare('SELECT * FROM activity_log_clients WHERE id = ?').get(reviewId);
  return NextResponse.json({
    ...(review as object),
    snapshots: db.prepare('SELECT * FROM activity_log_metric_snapshots WHERE activity_log_client_id = ? ORDER BY window_days').all(reviewId),
  }, { status: 201 });
}

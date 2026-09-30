import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { todayInfo, nextLogDueLabel } from '@/lib/activityLog';

// Today's status (none/draft/submitted) + the list of past submitted logs —
// everything Page 1 (Activity Log home) needs in one call.
export async function GET() {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const { dateStr } = todayInfo();

  const today = db.prepare(`
    SELECT al.*, (SELECT COUNT(*) FROM activity_log_clients c WHERE c.activity_log_id = al.id) AS client_count
    FROM activity_logs al WHERE al.log_date = ?
  `).get(dateStr) as any;

  const history = db.prepare(`
    SELECT al.id, al.log_date, al.day_of_week, al.media_buyer_name, al.submitted_at,
      (SELECT COUNT(*) FROM activity_log_clients c WHERE c.activity_log_id = al.id) AS client_count
    FROM activity_logs al
    WHERE al.status = 'submitted'
    ORDER BY al.log_date DESC
    LIMIT 50
  `).all();

  return NextResponse.json({ today: today ?? null, nextLogDue: nextLogDueLabel(), history });
}

// Creates (or returns the existing) draft for today. Checked by log_date
// alone, not by employee — with one media buyer today, "is there already a
// log for today" is the real rule; the UNIQUE(employee_id, log_date)
// constraint is a backstop, not the primary guard (NULL employee_id from an
// unlinked admin wouldn't collide against itself in SQLite's own uniqueness
// rules, so this explicit check is the one that actually matters).
export async function POST() {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const { dateStr, dayOfWeek } = todayInfo();

  const existing = db.prepare('SELECT * FROM activity_logs WHERE log_date = ?').get(dateStr);
  if (existing) return NextResponse.json(existing);

  const result = db.prepare(`
    INSERT INTO activity_logs (employee_id, media_buyer_name, log_date, day_of_week)
    VALUES (?, ?, ?, ?)
  `).run(auth.employeeId, auth.name, dateStr, dayOfWeek);

  const created = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(created, { status: 201 });
}

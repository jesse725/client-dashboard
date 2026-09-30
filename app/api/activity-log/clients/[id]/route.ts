import { NextResponse } from 'next/server';
import { requireActivityLogAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { CAMPAIGN_HEALTH_VALUES } from '@/lib/activityLog';

// `id` here is the activity_log_clients row id, not the log id.
function getEditableReview(db: ReturnType<typeof getDb>, id: string) {
  const review = db.prepare(`
    SELECT alc.*, al.status AS log_status
    FROM activity_log_clients alc
    JOIN activity_logs al ON al.id = alc.activity_log_id
    WHERE alc.id = ?
  `).get(id) as any;
  if (!review) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (review.log_status === 'submitted') {
    return { error: NextResponse.json({ error: 'This log has been submitted and is read-only.' }, { status: 400 }) };
  }
  if (review.review_status === 'locked') {
    return { error: NextResponse.json({ error: 'This client is locked. An admin can unlock it if it needs changes.' }, { status: 400 }) };
  }
  return { review };
}

// Campaign Health + "What I'm Seeing" — while still in_progress only.
// Never touches the frozen snapshot rows.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const { error } = getEditableReview(db, id);
  if (error) return error;

  const body = await req.json();
  const sets: string[] = [];
  const values: any[] = [];
  if ('campaignHealth' in body) {
    if (body.campaignHealth != null && !CAMPAIGN_HEALTH_VALUES.includes(body.campaignHealth)) {
      return NextResponse.json({ error: 'Invalid campaignHealth' }, { status: 400 });
    }
    sets.push('campaign_health = ?'); values.push(body.campaignHealth ?? null);
  }
  if ('observation' in body) { sets.push('observation = ?'); values.push(body.observation ?? null); }
  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  values.push(id);
  db.prepare(`UPDATE activity_log_clients SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json(db.prepare('SELECT * FROM activity_log_clients WHERE id = ?').get(id));
}

// Undo an accidental add — only while still in_progress (and thus never
// locked or submitted). This isn't "editing a locked snapshot," it's
// removing a review that was never finished.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivityLogAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  const { error } = getEditableReview(db, id);
  if (error) return error;

  db.prepare('DELETE FROM activity_log_clients WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}

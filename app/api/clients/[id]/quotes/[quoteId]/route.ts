import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; quoteId: string }> }
) {
  const { id, quoteId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  const allowed = ['customer_name', 'value', 'status', 'drive_url', 'notes'];
  const updates = allowed.filter((f) => f in body);
  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const set = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => body[f]);

  db.prepare(`UPDATE quotes SET ${set} WHERE id = ? AND client_id = ?`).run(
    ...values,
    quoteId,
    id
  );

  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
  return NextResponse.json(quote);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; quoteId: string }> }
) {
  const { id, quoteId } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  db.prepare('DELETE FROM quotes WHERE id = ? AND client_id = ?').run(quoteId, id);
  return NextResponse.json({ ok: true });
}

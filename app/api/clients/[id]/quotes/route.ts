import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const quotes = db.prepare('SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC').all(id);
  return NextResponse.json(quotes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO quotes (client_id, customer_name, value, profit_margin, quote_pdf_url, status, drive_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.customer_name,
    body.value ?? 0,
    body.profit_margin ?? null,
    body.quote_pdf_url ?? null,
    body.status ?? 'open',
    body.drive_url ?? null,
    body.notes ?? null,
  );

  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(quote, { status: 201 });
}

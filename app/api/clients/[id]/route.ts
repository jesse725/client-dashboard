import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(client);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  const fields = [
    'name', 'logo_url', 'ghl_api_key', 'ghl_location_id', 'ghl_pipeline_id',
    'stage_leads', 'stage_contacted', 'stage_unqualified', 'stage_phone', 'stage_inhome',
    'retainer_price', 'ad_spend', 'daily_ad_spend', 'contract_url', 'slack_url',
    'start_date', 'meta_access_token', 'meta_ad_account_id', 'next_checkin',
    'date_launched', 'date_billed', 'rebilling_date',
  ];

  const updates = fields.filter((f) => f in body);
  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const set = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => body[f]);

  db.prepare(`UPDATE clients SET ${set} WHERE id = ?`).run(...values, id);
  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}

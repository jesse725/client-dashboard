import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const rows = db.prepare('SELECT * FROM lead_dispositions').all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { opp_id, showed, qualified } = body;
  if (!opp_id) return NextResponse.json({ error: 'opp_id is required' }, { status: 400 });

  const db = getDb();
  const existing = db.prepare('SELECT opp_id FROM lead_dispositions WHERE opp_id = ?').get(opp_id);
  if (existing) {
    db.prepare(
      `UPDATE lead_dispositions SET showed = ?, qualified = ?, updated_at = datetime('now') WHERE opp_id = ?`
    ).run(showed === null || showed === undefined ? null : (showed ? 1 : 0), qualified === null || qualified === undefined ? null : (qualified ? 1 : 0), opp_id);
  } else {
    db.prepare(
      `INSERT INTO lead_dispositions (opp_id, showed, qualified) VALUES (?, ?, ?)`
    ).run(opp_id, showed === null || showed === undefined ? null : (showed ? 1 : 0), qualified === null || qualified === undefined ? null : (qualified ? 1 : 0));
  }

  const row = db.prepare('SELECT * FROM lead_dispositions WHERE opp_id = ?').get(opp_id);
  return NextResponse.json(row);
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';

const ALLOWED_KEYS = ['ghl_agency_key', 'sync_interval_minutes', 'last_sync', 'whop_api_key', 'whop_webhook_secret', 'whop_company_id'];
const MASKED_KEYS = ['ghl_agency_key', 'whop_api_key', 'whop_webhook_secret'];

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    // Mask secrets — only send whether they're set, not the actual value
    if (MASKED_KEYS.includes(row.key)) {
      settings[row.key] = row.value ? '••••••••' : '';
    } else {
      settings[row.key] = row.value;
    }
  }
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    // Don't overwrite a secret if its masked placeholder was sent back unchanged
    if (MASKED_KEYS.includes(key) && String(value).includes('•')) continue;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  }

  return NextResponse.json({ ok: true });
}

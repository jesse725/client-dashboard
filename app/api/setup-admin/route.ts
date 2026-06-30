import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

// One-time endpoint to set admin credentials — protected by secret token
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('token') !== 'merova-setup-2024') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const hash = bcrypt.hashSync('Merova88*', 10);

  const existing = db.prepare("SELECT id FROM users WHERE email = 'jesse@merovamedia.com'").get();
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, role = 'admin', name = 'Jesse' WHERE email = 'jesse@merovamedia.com'").run(hash);
  } else {
    db.prepare("INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, 'admin', 'Jesse')").run('jesse@merovamedia.com', hash);
  }

  return NextResponse.json({ ok: true, message: 'Admin credentials set for jesse@merovamedia.com' });
}

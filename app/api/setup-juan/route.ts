import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('token') !== 'merova-setup-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // Find Juan's client by contact_email or name
  const client = db.prepare(
    `SELECT id, name FROM clients WHERE LOWER(contact_email) = 'juancarlo502@yahoo.com'
       OR LOWER(name) LIKE '%juan%'
     ORDER BY id LIMIT 1`
  ).get() as any;

  if (!client) {
    return NextResponse.json({ error: 'No client found matching Juan. Please onboard him first.' }, { status: 404 });
  }

  const email = 'juancarlo502@yahoo.com';
  const hash = bcrypt.hashSync(email, 10); // passwordless — auth checks email only

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as any;
  if (existing) {
    db.prepare("UPDATE users SET client_id = ?, role = 'client', password_hash = ? WHERE email = ?")
      .run(client.id, hash, email);
  } else {
    db.prepare("INSERT INTO users (email, password_hash, role, client_id, name) VALUES (?, ?, 'client', ?, ?)")
      .run(email, hash, client.id, 'Juan');
  }

  return NextResponse.json({
    ok: true,
    message: `Login created for juancarlo502@yahoo.com → linked to client "${client.name}" (id ${client.id})`,
  });
}

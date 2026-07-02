import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('token') !== 'merova-setup-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // If client_id is specified, use it directly
  const clientIdParam = searchParams.get('client_id');

  // List mode — show all clients so we can find the right ID
  if (searchParams.get('list') === '1') {
    const clients = db.prepare(
      'SELECT id, name, contact_name, contact_email, retainer_price FROM clients ORDER BY id'
    ).all();
    const users = db.prepare('SELECT id, email, role, client_id FROM users ORDER BY id').all();
    return NextResponse.json({ clients, users });
  }

  let client: any = null;

  if (clientIdParam) {
    client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientIdParam);
  } else {
    client = db.prepare(
      `SELECT id, name FROM clients WHERE LOWER(contact_email) = 'juancarlo502@yahoo.com'
         OR LOWER(name) LIKE '%juan%'
         OR retainer_price = 1750
       ORDER BY id LIMIT 1`
    ).get();
  }

  if (!client) {
    const all = db.prepare('SELECT id, name, contact_email, retainer_price FROM clients ORDER BY id').all();
    return NextResponse.json({
      error: 'No client found. Add ?list=1 to see all clients, then ?client_id=X to link Juan to the correct one.',
      clients: all,
    }, { status: 404 });
  }

  const email = 'juancarlo502@yahoo.com';
  const hash = bcrypt.hashSync(email, 10);

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
    loginUrl: 'https://web-production-c1d62.up.railway.app/login',
    email,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Shared secret — set WEBHOOK_SECRET env var in Railway
function verifySecret(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured = allow (dev mode)
  const provided =
    req.headers.get('x-webhook-secret') ??
    new URL(req.url).searchParams.get('secret');
  return provided === secret;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function uniqueSlug(db: ReturnType<typeof getDb>, base: string): string {
  let slug = base;
  let i = 2;
  while (db.prepare('SELECT id FROM clients WHERE slug = ?').get(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Expected fields from Google Apps Script:
  // business_name, contact_name, contact_email, contact_phone,
  // address, ein, target_locations
  const name = (body.business_name ?? body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'business_name is required' }, { status: 400 });

  const db = getDb();
  const slug = uniqueSlug(db, slugify(name));

  const existing = db.prepare('SELECT id FROM clients WHERE name = ? AND onboard_status = ?').get(name, 'pending');
  if (existing) {
    // Update the existing pending record instead of creating a duplicate
    db.prepare(`
      UPDATE clients SET
        contact_name = ?, contact_email = ?, contact_phone = ?,
        address = ?, ein = ?, target_locations = ?
      WHERE id = ?
    `).run(
      body.contact_name ?? null,
      body.contact_email ?? null,
      body.contact_phone ?? null,
      body.address ?? null,
      body.ein ?? null,
      body.target_locations ?? null,
      (existing as any).id,
    );
    return NextResponse.json({ ok: true, action: 'updated', id: (existing as any).id });
  }

  const result = db.prepare(`
    INSERT INTO clients
      (name, slug, contact_name, contact_email, contact_phone, address, ein, target_locations,
       retainer_price, ad_spend, daily_ad_spend, start_date, onboard_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, date('now'), 'pending')
  `).run(
    name, slug,
    body.contact_name ?? null,
    body.contact_email ?? null,
    body.contact_phone ?? null,
    body.address ?? null,
    body.ein ?? null,
    body.target_locations ?? null,
  );

  return NextResponse.json({ ok: true, action: 'created', id: result.lastInsertRowid }, { status: 201 });
}

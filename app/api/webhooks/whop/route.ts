import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyWhopSignature, fetchWhopMembership } from '@/lib/whop';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const db = getDb();

  const secretRow = db.prepare("SELECT value FROM settings WHERE key = 'whop_webhook_secret'").get() as any;
  const secret = secretRow?.value ?? '';

  if (secret) {
    const valid = verifyWhopSignature(rawBody, {
      id: req.headers.get('webhook-id'),
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    }, secret);
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = event.type ?? event.action ?? event.event;
  if (eventType !== 'payment.succeeded') {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const payment = event.data ?? {};
  const email = (payment.user?.email ?? payment.membership?.user?.email ?? '').trim().toLowerCase();
  const total = payment.total ?? payment.settlement_amount ?? payment.subtotal ?? null;
  const membershipId = payment.membership?.id ?? payment.membership_id ?? null;

  if (!email) {
    return NextResponse.json({ ok: true, error: 'No customer email on payment event' });
  }

  const client = db.prepare('SELECT * FROM clients WHERE LOWER(contact_email) = ?').get(email) as any;
  if (!client) {
    return NextResponse.json({ ok: true, error: `No client matches email ${email}` });
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (total != null) {
    updates.push('retainer_price = ?');
    values.push(Number(total));
  }

  // Pull the current billing-period end from the membership for an accurate rebilling date
  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'whop_api_key'").get() as any;
  const apiKey = apiKeyRow?.value ?? '';
  if (apiKey && membershipId) {
    try {
      const membership = await fetchWhopMembership(apiKey, membershipId);
      if (membership.renewalPeriodEnd) {
        updates.push('rebilling_date = ?');
        values.push(membership.renewalPeriodEnd);
      }
    } catch (e) {
      // Non-fatal — retainer_price still gets updated from the webhook payload alone
    }
  }

  if (updates.length > 0) {
    values.push(client.id);
    db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return NextResponse.json({ ok: true, clientId: client.id, updated: updates });
}

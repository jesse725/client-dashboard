import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getDb();

  if (event.type === 'invoice.payment_succeeded') {
    const inv = event.data.object as Stripe.Invoice;
    db.prepare(
      `UPDATE invoices SET status = 'paid', paid_at = ? WHERE stripe_invoice_id = ?`
    ).run(new Date().toISOString(), inv.id);
  }

  if (event.type === 'invoice.payment_failed' || event.type === 'invoice.voided') {
    const inv = event.data.object as Stripe.Invoice;
    const status = event.type === 'invoice.voided' ? 'void' : 'open';
    db.prepare(`UPDATE invoices SET status = ? WHERE stripe_invoice_id = ?`).run(status, inv.id);
  }

  return NextResponse.json({ received: true });
}

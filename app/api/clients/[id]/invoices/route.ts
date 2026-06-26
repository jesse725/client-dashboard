import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { stripe, getOrCreateStripeCustomer, createRetainerInvoice } from '@/lib/stripe';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const db = getDb();
  const invoices = db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC').all(Number(id));
  return NextResponse.json(invoices);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(id)) as any;
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const amount: number = body.amount ?? client.retainer_price;
  const description: string = body.description ?? `Retainer — ${client.name}`;

  if (!stripe) {
    // Record manually without Stripe
    db.prepare(
      `INSERT INTO invoices (client_id, amount, status, description) VALUES (?, ?, 'open', ?)`
    ).run(client.id, amount, description);
    const inv = db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(client.id);
    return NextResponse.json(inv, { status: 201 });
  }

  // Ensure Stripe customer exists
  let customerId = client.stripe_customer_id;
  if (!customerId) {
    customerId = await getOrCreateStripeCustomer(client.id, client.name);
    db.prepare('UPDATE clients SET stripe_customer_id = ? WHERE id = ?').run(customerId, client.id);
  }

  const stripeInvoice = await createRetainerInvoice(customerId, amount, description);

  db.prepare(
    `INSERT INTO invoices (client_id, stripe_invoice_id, amount, status, description, invoice_url, period_start, period_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    client.id,
    stripeInvoice.id,
    amount,
    stripeInvoice.status ?? 'open',
    description,
    stripeInvoice.hosted_invoice_url ?? null,
    stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000).toISOString() : null,
    stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000).toISOString() : null,
  );

  const inv = db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(client.id);
  return NextResponse.json(inv, { status: 201 });
}

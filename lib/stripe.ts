import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — Stripe features disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' })
  : null;

export async function getOrCreateStripeCustomer(
  clientId: number,
  name: string,
  email?: string
): Promise<string> {
  if (!stripe) throw new Error('Stripe not configured');
  const customer = await stripe.customers.create({ name, email, metadata: { clientId: String(clientId) } });
  return customer.id;
}

export async function createRetainerInvoice(
  stripeCustomerId: string,
  amountDollars: number,
  description: string
): Promise<Stripe.Invoice> {
  if (!stripe) throw new Error('Stripe not configured');
  const cents = Math.round(amountDollars * 100);
  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    amount: cents,
    currency: 'usd',
    description,
  });
  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: 'send_invoice',
    days_until_due: 7,
    auto_advance: true,
  });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(finalized.id);
  return finalized;
}

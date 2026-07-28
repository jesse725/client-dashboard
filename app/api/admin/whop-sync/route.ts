import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listWhopMemberships, fetchWhopMembership } from '@/lib/whop';

export async function POST() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'whop_api_key'").get() as any;
  const apiKey = apiKeyRow?.value ?? '';
  if (!apiKey) {
    return NextResponse.json({ error: 'Whop API key is not configured — add it in Admin Settings first.' }, { status: 400 });
  }

  const clients = db.prepare(
    "SELECT id, name, contact_email, rebilling_date FROM clients WHERE contact_email IS NOT NULL AND contact_email != '' AND onboard_status != 'pending'"
  ).all() as { id: number; name: string; contact_email: string; rebilling_date: string | null }[];
  const clientsByEmail = new Map(clients.map(c => [c.contact_email.trim().toLowerCase(), c]));

  let memberships;
  try {
    memberships = await listWhopMemberships(apiKey);
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to list Whop memberships: ${e.message}` }, { status: 502 });
  }

  const updated: { client: string; rebilling_date: string }[] = [];
  const unmatchedEmails: string[] = [];

  for (const m of memberships) {
    const email = m.email?.trim().toLowerCase();
    if (!email) continue;
    const client = clientsByEmail.get(email);
    if (!client) { unmatchedEmails.push(email); continue; }

    try {
      const detail = await fetchWhopMembership(apiKey, m.id);
      if (detail.renewalPeriodEnd && detail.renewalPeriodEnd !== client.rebilling_date) {
        db.prepare('UPDATE clients SET rebilling_date = ? WHERE id = ?').run(detail.renewalPeriodEnd, client.id);
        updated.push({ client: client.name, rebilling_date: detail.renewalPeriodEnd });
      }
    } catch {
      // skip this membership, continue with the rest
    }
  }

  const matchedEmails = new Set(memberships.map(m => m.email?.trim().toLowerCase()).filter(Boolean));
  const clientsWithNoWhopMatch = clients.filter(c => !matchedEmails.has(c.contact_email.trim().toLowerCase())).map(c => c.name);

  return NextResponse.json({
    ok: true,
    membershipsChecked: memberships.length,
    updated,
    clientsWithNoWhopMatch,
  });
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listWhopMemberships, fetchWhopMembership, fetchWhopCompanyId } from '@/lib/whop';

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

  let companyId = (db.prepare("SELECT value FROM settings WHERE key = 'whop_company_id'").get() as any)?.value ?? '';
  if (!companyId) {
    try {
      companyId = await fetchWhopCompanyId(apiKey);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('whop_company_id', ?)").run(companyId);
    } catch (e: any) {
      return NextResponse.json({
        error: `Couldn't auto-detect your Whop Company ID (${e.message}). Add it manually in Admin Settings → Whop Billing → Company ID — find it in your Whop dashboard URL, it looks like "biz_xxxxxxxxxxxx".`,
      }, { status: 400 });
    }
  }

  const clients = db.prepare(
    "SELECT id, name, contact_email, rebilling_date FROM clients WHERE contact_email IS NOT NULL AND contact_email != '' AND onboard_status != 'pending'"
  ).all() as { id: number; name: string; contact_email: string; rebilling_date: string | null }[];
  const clientsByEmail = new Map(clients.map(c => [c.contact_email.trim().toLowerCase(), c]));

  let memberships;
  try {
    memberships = await listWhopMemberships(apiKey, companyId);
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to list Whop memberships: ${e.message}` }, { status: 502 });
  }

  // Only "active" (or "trialing") memberships represent a real, currently-paying
  // subscription. A client can have several drafted/completed/canceled
  // memberships in Whop's history — those aren't real and must not be allowed
  // to overwrite a real rebilling_date.
  const LIVE_STATUSES = new Set(['active', 'trialing']);
  const liveMemberships = memberships.filter(m => LIVE_STATUSES.has(m.status));

  const updated: { client: string; rebilling_date: string }[] = [];
  const multipleActive: string[] = [];

  const byClient = new Map<string, typeof liveMemberships>();
  for (const m of liveMemberships) {
    const email = m.email?.trim().toLowerCase();
    if (!email || !clientsByEmail.has(email)) continue;
    byClient.set(email, [...(byClient.get(email) ?? []), m]);
  }

  for (const [email, ms] of byClient) {
    const client = clientsByEmail.get(email)!;
    if (ms.length > 1) multipleActive.push(client.name);

    for (const m of ms) {
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
  }

  const matchedEmails = new Set(liveMemberships.map(m => m.email?.trim().toLowerCase()).filter(Boolean));
  const clientsWithNoWhopMatch = clients.filter(c => !matchedEmails.has(c.contact_email.trim().toLowerCase())).map(c => c.name);
  const unmatchedEmails = [...new Set(liveMemberships.map(m => m.email?.trim().toLowerCase()).filter((e): e is string => !!e && !clientsByEmail.has(e)))];

  return NextResponse.json({
    ok: true,
    membershipsChecked: memberships.length,
    liveMembershipsChecked: liveMemberships.length,
    updated,
    clientsWithNoWhopMatch,
    // Emails Whop has on file that didn't match any client's Contact Email —
    // useful for spotting a typo/different-email mismatch.
    unmatchedWhopEmails: [...new Set(unmatchedEmails)],
    // Clients with more than one active/trialing membership — worth checking
    // manually via /api/admin/whop-debug?email=... to confirm which is real.
    multipleActiveMemberships: multipleActive,
  });
}

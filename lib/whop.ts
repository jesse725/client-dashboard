import crypto from 'crypto';

const WHOP_API_BASE = 'https://api.whop.com/api/v1';

// Whop signs webhooks using the Standard Webhooks spec:
// https://www.standardwebhooks.com/ — headers webhook-id / webhook-timestamp /
// webhook-signature, HMAC-SHA256 over "{id}.{timestamp}.{rawBody}".
export function verifyWhopSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // webhook-signature header can carry multiple space-separated "v1,<sig>" values
  const provided = headers.signature.split(' ').map(s => s.split(',')[1]).filter(Boolean);
  return provided.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export interface WhopMembership {
  renewalPeriodEnd: string | null; // YYYY-MM-DD
  email: string | null;
}

export async function fetchWhopMembership(apiKey: string, membershipId: string): Promise<WhopMembership> {
  const res = await fetch(`${WHOP_API_BASE}/memberships/${membershipId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Whop API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    renewalPeriodEnd: data.renewal_period_end ? String(data.renewal_period_end).slice(0, 10) : null,
    email: data.user?.email ?? null,
  };
}

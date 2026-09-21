import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, canViewFinancials, requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { cleanMetaToken, normalizeAdAccountId } from '@/lib/meta';
import { checkLeadTracking, checkMetaConnection, loadChecks, saveCheck } from '@/lib/metaHealth';
import { Client } from '@/types';

// Backs the Meta Health tab and the "Test connection" buttons.
//
//   GET                              — the saved result of the last check per client (no Meta calls)
//   POST { clientId }                — check that client's SAVED connection, including how its
//                                      Meta leads compare with GoHighLevel's, and save the result
//   POST { token, adAccountId }      — test values that aren't saved yet (Edit Client / onboarding);
//                                      with a clientId it's still a Meta-only test and isn't saved
//   POST { scope: 'sales' }          — the agency's own ad account (Sales Tracker), Jesse only;
//                                      may also carry unsaved token / adAccountId to test
//
// Results never include the access token.

async function adminUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  return session && user?.role === 'admin' ? user : null;
}

const typed = (v: unknown): string => (typeof v === 'string' && !v.includes('•') ? v : '');

// Values that are just what's already saved (the Edit Client form is prefilled with them)
// don't count as "unsaved" — that check is the real one, and is kept.
const differs = (typedToken: string, typedAccount: string, savedToken: string, savedAccount: string) =>
  (!!typedToken && cleanMetaToken(typedToken) !== cleanMetaToken(savedToken)) ||
  (!!typedAccount.trim() && normalizeAdAccountId(typedAccount) !== normalizeAdAccountId(savedAccount));

export async function GET() {
  const user = await adminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clients, sales } = loadChecks();
  return NextResponse.json({ clients, sales: canViewFinancials(user.email) ? sales : null });
}

export async function POST(req: NextRequest) {
  const user = await adminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const setting = (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? '';
    const typedToken = typed(body?.token);
    const typedAccount = typeof body?.adAccountId === 'string' ? body.adAccountId : '';

    if (body?.scope === 'sales') {
      const auth = await requireFinancialAccess();
      if (!auth.ok) return auth.response;
      const savedToken = setting('sales_meta_access_token');
      const savedAccount = setting('sales_meta_ad_account_id');
      const overriding = differs(typedToken, typedAccount, savedToken, savedAccount);
      const check = await checkMetaConnection(
        overriding ? typedToken || savedToken : savedToken,
        overriding ? typedAccount || savedAccount : savedAccount
      );
      if (!overriding) saveCheck('sales', check);
      return NextResponse.json({ check });
    }

    if (body?.clientId != null) {
      const id = Number(body.clientId);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 });
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client | undefined;
      if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

      const savedToken = client.meta_access_token || '';
      const savedAccount = client.meta_ad_account_id || '';
      const overriding = differs(typedToken, typedAccount, savedToken, savedAccount);
      const check = await checkMetaConnection(
        overriding ? typedToken || savedToken : savedToken,
        overriding ? typedAccount || savedAccount : savedAccount
      );
      if (!overriding) {
        await checkLeadTracking(client, setting('ghl_agency_key'), check);
        saveCheck(client.id, check);
      }
      return NextResponse.json({ check });
    }

    if (typedToken || typedAccount) {
      return NextResponse.json({ check: await checkMetaConnection(typedToken, typedAccount) });
    }
    return NextResponse.json({ error: 'Nothing to check' }, { status: 400 });
  } catch (e: any) {
    console.error(`[meta-check] ${e?.message ?? e}`);
    return NextResponse.json({ error: e?.message ?? 'Something went wrong' }, { status: 500 });
  }
}

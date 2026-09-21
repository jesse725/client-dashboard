import { NextRequest, NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { cleanMetaToken, fetchMetaAdStats, metaErrorMessage, normalizeAdAccountId } from '@/lib/meta';
import { ageLabel, cachedMeta } from '@/lib/metaCache';

export async function GET(req: NextRequest) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const db = getDb();
  const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_access_token'").get() as any;
  const acctRow = db.prepare("SELECT value FROM settings WHERE key = 'sales_meta_ad_account_id'").get() as any;
  const accessToken = cleanMetaToken(tokenRow?.value);
  const adAccountId = normalizeAdAccountId(acctRow?.value);

  if (!accessToken || !adAccountId) {
    return NextResponse.json({ connected: false, adAccountId: '' });
  }

  // Three calls per visit, and this page is opened often — cached for ten minutes,
  // and if Meta refuses a refresh the last good figures are shown, marked stale,
  // instead of the whole section turning into an error.
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  try {
    const [last7d, thisMonth, lifetime] = await Promise.all(
      ['last_7d', 'this_month', 'maximum'].map((preset) =>
        cachedMeta(`sales:${adAccountId}:${preset}`, { refresh }, () => fetchMetaAdStats(accessToken, adAccountId, preset))
      )
    );
    const stale = [last7d, thisMonth, lifetime].find((c) => c.stale);
    return NextResponse.json({
      connected: true, adAccountId,
      last7d: last7d.value, thisMonth: thisMonth.value, lifetime: lifetime.value,
      ...(stale ? { warning: `${stale.error} Showing the last figures Meta returned, from ${ageLabel(stale.fetchedAt)}.` } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ connected: true, adAccountId, error: metaErrorMessage(e) }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { access_token, ad_account_id } = await req.json();
  const db = getDb();

  if (ad_account_id !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sales_meta_ad_account_id', ?)").run(normalizeAdAccountId(String(ad_account_id)));
  }
  // Only overwrite the token if a real (non-masked) value was sent
  if (access_token && !String(access_token).includes('•')) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('sales_meta_access_token', ?)").run(cleanMetaToken(String(access_token)));
  }

  return NextResponse.json({ ok: true });
}

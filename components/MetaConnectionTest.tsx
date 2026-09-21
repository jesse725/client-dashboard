'use client';
import { useState } from 'react';
import { Loader2, PlugZap } from 'lucide-react';
import type { MetaCheck } from '@/lib/metaHealth';
import MetaCheckReport, { StatusPill } from './MetaCheckReport';

// "Test connection" for the places a Meta token/ad account is typed in (Edit
// Client, onboarding, Sales Tracker). Tries the values as they are in the form —
// saved or not — so a bad token is caught before it's stored, not weeks later when
// the numbers quietly stop updating.

export default function MetaConnectionTest({ token, adAccountId, clientId, scope }: {
  token: string;
  adAccountId: string;
  clientId?: number;
  scope?: 'sales';
}) {
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<MetaCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/meta-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, adAccountId, ...(clientId ? { clientId } : {}), ...(scope ? { scope } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.check) throw new Error(data?.error ?? `the server returned ${res.status}`);
      setCheck(data.check);
    } catch (e: any) {
      setCheck(null);
      setError(`Couldn't run the test — ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={run} disabled={busy || (!token.trim() && !scope) || !adAccountId.trim()}
          className="btn-ghost text-xs flex items-center gap-1.5" style={{ padding: '6px 12px' }}
          title={!token.trim() && !scope ? 'Paste an access token first' : !adAccountId.trim() ? 'Enter the ad account ID first' : 'Checks the token, the ad account, and that ads are delivering'}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />} Test connection
        </button>
        {check && !busy && <StatusPill check={check} />}
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
      {check && (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <MetaCheckReport check={check} />
        </div>
      )}
    </div>
  );
}

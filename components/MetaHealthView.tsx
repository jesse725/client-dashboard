'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import type { MetaCheck } from '@/lib/metaHealth';
import MetaCheckReport, { StatusPill, severity, tokenSummary } from './MetaCheckReport';

// The Client Tracker's "Meta Health" tab: every client's Meta connection (and the
// agency's own) checked end to end — token, ad account, whether ads are delivering,
// and whether the leads Meta counts are reaching GoHighLevel. Results are saved, so
// the tab opens on the last check; "Check all" refreshes them.

interface ClientLite { id: number; name: string; client_status: string; has_meta_credentials?: boolean }
interface Entry { key: string; label: string; clientId?: number; scope?: 'sales'; connected: boolean }

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CONCURRENCY = 3;

export default function MetaHealthView({ clients, isOwner }: { clients: ClientLite[]; isOwner: boolean }) {
  const [checks, setChecks] = useState<Record<string, MetaCheck>>({});
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const entries: Entry[] = useMemo(() => [
    // The agency's own ad account (Sales Tracker) — same owner-only access as that page.
    ...(isOwner ? [{ key: 'sales', label: 'Merova Media — our own ad account (Sales Tracker)', scope: 'sales' as const, connected: true }] : []),
    ...clients.filter((c) => c.client_status !== 'Churned').map((c) => ({ key: String(c.id), label: c.name, clientId: c.id, connected: !!c.has_meta_credentials })),
  ], [clients, isOwner]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/meta-check');
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) throw new Error(data?.error ?? `the server returned ${res.status}`);
        if (cancelled) return;
        const saved: Record<string, MetaCheck> = {};
        for (const [id, c] of Object.entries<MetaCheck>(data.clients ?? {})) saved[id] = c;
        if (data.sales) saved.sales = data.sales;
        setChecks(saved);
      } catch (e: any) {
        if (!cancelled) setLoadError(`Couldn't load the last results — ${e?.message ?? e}`);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runOne = useCallback(async (entry: Entry) => {
    setRunning((r) => new Set(r).add(entry.key));
    setErrors((e) => { const { [entry.key]: _gone, ...rest } = e; return rest; });
    try {
      const res = await fetch('/api/admin/meta-check', {
        method: 'POST', headers: JSON_HEADERS,
        body: JSON.stringify(entry.scope ? { scope: entry.scope } : { clientId: entry.clientId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.check) throw new Error(data?.error ?? `the server returned ${res.status}`);
      setChecks((c) => ({ ...c, [entry.key]: data.check }));
    } catch (e: any) {
      setErrors((errs) => ({ ...errs, [entry.key]: `Check failed — ${e?.message ?? e}` }));
    } finally {
      setRunning((r) => { const n = new Set(r); n.delete(entry.key); return n; });
    }
  }, []);

  async function runAll() {
    const todo = entries.filter((e) => e.connected);
    setBatch({ done: 0, total: todo.length });
    let next = 0;
    let done = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
      while (next < todo.length) {
        const entry = todo[next++];
        await runOne(entry);
        setBatch({ done: ++done, total: todo.length });
      }
    }));
    setBatch(null);
  }

  // Worst first; connected-but-never-checked ahead of the healthy ones (unknown deserves a look);
  // clients with no Meta connection at all last.
  const rows = useMemo(() => {
    const rank = (e: Entry) => {
      const c = checks[e.key];
      if (c) return severity(c) + 1; // 3 = problem, 2 = needs attention, 1 = healthy
      return e.connected ? 1.5 : -1;
    };
    return [...entries].sort((a, b) => rank(b) - rank(a) || a.label.localeCompare(b.label));
  }, [entries, checks]);

  const counts = useMemo(() => {
    let problem = 0, attention = 0, healthy = 0, unchecked = 0, none = 0;
    for (const e of entries) {
      const c = checks[e.key];
      if (c) { const s = severity(c); if (s === 2) problem++; else if (s === 1) attention++; else healthy++; }
      else if (e.connected) unchecked++;
      else none++;
    }
    return { problem, attention, healthy, unchecked, none };
  }, [entries, checks]);

  const lastChecked = useMemo(() => {
    const times = Object.values(checks).map((c) => new Date(c.checkedAt).getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }, [checks]);

  const busy = batch != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Activity size={16} style={{ color: 'var(--accent)' }} /> Meta Health</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Checks each Meta connection end to end: the token, the ad account, whether ads are actually spending, and whether the leads Meta counts are reaching GoHighLevel.
            {lastChecked ? ` Last checked ${lastChecked.toLocaleString()}.` : ' Not checked yet.'}
          </p>
        </div>
        <button onClick={runAll} disabled={busy} className="btn-primary text-sm flex items-center gap-1.5">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {busy ? `Checking ${batch!.done} of ${batch!.total}…` : 'Check all connections'}
        </button>
      </div>

      {loadError && <div className="card p-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{loadError}</div>}

      <div className="flex flex-wrap gap-2 text-xs">
        {([
          [counts.problem, 'with a problem', 'var(--red)'],
          [counts.attention, 'need attention', 'var(--yellow)'],
          [counts.healthy, 'healthy', 'var(--green)'],
          [counts.unchecked, 'not checked yet', 'var(--text-muted)'],
          [counts.none, 'no Meta connection', 'var(--text-muted)'],
        ] as const).filter(([n]) => n > 0).map(([n, label, color]) => (
          <span key={label} className="px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color }}>{n} {label}</span>
        ))}
      </div>

      <div className="card overflow-hidden">
        {!loaded && <p className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {loaded && rows.length === 0 && <p className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>No clients yet.</p>}
        {rows.map((e, i) => {
          const c = checks[e.key];
          const isRunning = running.has(e.key);
          const top = c?.issues.find((x) => x.level === 'error') ?? c?.issues.find((x) => x.level === 'warn');
          const expanded = open === e.key;
          const tok = c ? tokenSummary(c) : null;
          return (
            <div key={e.key} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div className="px-4 py-3 flex items-start gap-3">
                <button onClick={() => c && setOpen(expanded ? null : e.key)} disabled={!c} className="mt-0.5 shrink-0 disabled:opacity-20" aria-label={expanded ? 'Hide details' : 'Show details'}>
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-sm">{e.label}</span>
                    {c ? <StatusPill check={c} />
                      : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.connected ? 'Not checked yet' : 'No Meta connection saved'}</span>}
                    {c && tok && <span className="text-xs" style={{ color: tok.color }}>Token: {tok.text}</span>}
                    {c?.delivery && <span className="text-xs" style={{ color: c.delivery.spend7d === 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>${Math.round(c.delivery.spend7d).toLocaleString()} spent in 7 days</span>}
                    {c?.metaLeads && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Leads (30d): Meta {c.metaLeads.last30d}{c.leadTracking && !c.leadTracking.error ? ` · GHL ${c.leadTracking.newLeads}` : ''}</span>}
                  </div>
                  {top && !expanded && (
                    <p className="text-xs mt-1 truncate" style={{ color: top.level === 'error' ? 'var(--red)' : 'var(--yellow)' }} title={top.message}>{top.message}</p>
                  )}
                  {errors[e.key] && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>{errors[e.key]}</p>}
                </div>
                {e.connected && (
                  <button onClick={() => runOne(e)} disabled={isRunning || busy} className="btn-ghost text-xs flex items-center gap-1.5 shrink-0" style={{ padding: '5px 10px' }}>
                    {isRunning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {c ? 'Re-check' : 'Check'}
                  </button>
                )}
              </div>
              {expanded && c && (
                <div className="px-4 pb-4 pl-11">
                  <MetaCheckReport check={c} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Tokens made from a personal login (for example in Meta's Graph API Explorer) stop working after about 60 days. A System User token, made in Meta Business Settings, doesn't expire — and one System User can cover every client whose ad account is shared with your Business.
      </p>
    </div>
  );
}

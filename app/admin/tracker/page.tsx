'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, DollarSign, TrendingUp, Home, Calendar,
  ChevronRight, AlertTriangle, CheckCircle, Clock, Pause, XCircle,
  StickyNote, BarChart2,
} from 'lucide-react';

interface ClientRow {
  id: number;
  name: string;
  start_date: string;
  retainer_price: number;
  daily_ad_spend: number;
  ad_spend: number;
  client_status: string;
  internal_notes: string | null;
  next_checkin: string | null;
  rebilling_date: string | null;
  contact_name: string | null;
  stage_inhome: string | null;
  cached_leads: number;
  cached_inhome: number;
  // aggregated
  total_quotes: number;
  total_quoted_value: number;
  closed_deals: number;
  revenue_closed: number;
}

const STATUSES = ['Active', 'Onboarding', 'At Risk', 'Paused', 'Churned'];

const STATUS_META: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  Active:     { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: <CheckCircle size={11} /> },
  Onboarding: { color: '#6c63ff', bg: 'rgba(108,99,255,0.12)', icon: <Clock size={11} /> },
  'At Risk':  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: <AlertTriangle size={11} /> },
  Paused:     { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',icon: <Pause size={11} /> },
  Churned:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: <XCircle size={11} /> },
};

function tenure(startDate: string): string {
  const days = Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
}

function fmt$(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export default function TrackerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('All');
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    const user = session?.user as any;
    if (status === 'unauthenticated' || (session && user?.role !== 'admin')) {
      router.push('/login');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/admin/overview')
      .then(r => r.json())
      .then(data => { setClients(Array.isArray(data) ? data : []); setLoading(false); });
  }, [status]);

  async function updateStatus(id: number, client_status: string) {
    setClients(cs => cs.map(c => c.id === id ? { ...c, client_status } : c));
    await fetch('/api/admin/overview', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, client_status }),
    });
  }

  async function saveNote(id: number) {
    setSavingNote(true);
    setClients(cs => cs.map(c => c.id === id ? { ...c, internal_notes: noteText } : c));
    await fetch('/api/admin/overview', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, internal_notes: noteText }),
    });
    setSavingNote(false);
    setEditingNote(null);
  }

  const active = clients.filter(c => c.client_status !== 'Churned');
  const shown = filter === 'All' ? clients : clients.filter(c => c.client_status === filter);

  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);
  const totalRevenue = clients.reduce((s, c) => s + c.revenue_closed, 0);
  const totalQuoted = clients.reduce((s, c) => s + c.total_quoted_value, 0);
  const totalClosed = clients.reduce((s, c) => s + c.closed_deals, 0);
  const totalJobs = clients.reduce((s, c) => s + c.total_quotes, 0);
  const overallCloseRate = totalJobs > 0 ? (totalClosed / totalJobs) * 100 : 0;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading tracker…</div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <Link href="/admin" className="flex items-center gap-1.5 text-sm hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Admin
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="font-semibold">Client Tracker</span>
        <div className="ml-auto flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <Users size={13} />
          <span>{active.length} active · {clients.filter(c => c.client_status === 'Churned').length} churned</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Summary Tiles ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Active Clients',  value: String(active.length),            icon: <Users size={14} />,      color: 'var(--accent)' },
            { label: 'Monthly Retainer',value: fmt$(totalMRR),                   icon: <DollarSign size={14} />, color: 'var(--green)' },
            { label: 'Revenue Generated',value: fmt$(totalRevenue),              icon: <TrendingUp size={14} />, color: 'var(--green)' },
            { label: 'Total Quoted',    value: fmt$(totalQuoted),                icon: <BarChart2 size={14} />,  color: 'var(--yellow)' },
            { label: 'Jobs Closed',     value: `${totalClosed} / ${totalJobs}`,  icon: <CheckCircle size={14} />,color: 'var(--green)' },
            { label: 'Avg Close Rate',  value: `${overallCloseRate.toFixed(1)}%`,icon: <TrendingUp size={14} />, color: overallCloseRate >= 30 ? 'var(--green)' : 'var(--yellow)' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className="flex items-center gap-2 mb-2" style={{ color: s.color }}>
                {s.icon}
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Status Filter ────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          {['All', ...STATUSES].map(s => {
            const meta = STATUS_META[s];
            const count = s === 'All' ? clients.length : clients.filter(c => c.client_status === s).length;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className="text-sm px-3 py-1.5 rounded-full font-medium transition-all flex items-center gap-1.5"
                style={{
                  background: filter === s ? (meta?.bg ?? 'var(--accent)22') : 'var(--surface-2)',
                  color: filter === s ? (meta?.color ?? 'var(--accent)') : 'var(--text-muted)',
                  border: `1px solid ${filter === s ? (meta?.color ?? 'var(--accent)') : 'var(--border)'}`,
                }}>
                {meta?.icon} {s} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* ── Client Cards ─────────────────────────────────────────── */}
        <div className="space-y-3">
          {shown.length === 0 && (
            <div className="card p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No clients in this category.
            </div>
          )}
          {shown.map(c => {
            const closeRate = c.total_quotes > 0 ? (c.closed_deals / c.total_quotes) * 100 : 0;
            const statusMeta = STATUS_META[c.client_status] ?? STATUS_META['Active'];
            const isOverdue = c.next_checkin && new Date(c.next_checkin) < new Date();
            const daysUntilBilling = c.rebilling_date
              ? Math.ceil((new Date(c.rebilling_date).getTime() - Date.now()) / 86400000)
              : null;

            return (
              <div key={c.id} className="card p-5">
                <div className="flex items-start gap-4">

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: 'var(--accent)' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-base">{c.name}</span>

                      {/* Status badge — clickable dropdown */}
                      <div className="relative group">
                        <button
                          className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 cursor-pointer"
                          style={{ background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.color}44` }}>
                          {statusMeta.icon} {c.client_status}
                        </button>
                        <div className="absolute left-0 top-full mt-1 z-20 hidden group-hover:flex flex-col rounded-lg overflow-hidden shadow-lg"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 130 }}>
                          {STATUSES.map(s => (
                            <button key={s} onClick={() => updateStatus(c.id, s)}
                              className="text-left text-xs px-3 py-2 flex items-center gap-2 hover:opacity-80"
                              style={{ color: STATUS_META[s].color, background: c.client_status === s ? STATUS_META[s].bg : 'transparent' }}>
                              {STATUS_META[s].icon} {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tenure */}
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        🕐 {tenure(c.start_date)} with us
                      </span>

                      {/* Billing alert */}
                      {daysUntilBilling !== null && daysUntilBilling <= 7 && (
                        <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)' }}>
                          <Calendar size={10} /> Bill in {daysUntilBilling}d
                        </span>
                      )}
                    </div>

                    {c.contact_name && (
                      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Contact: {c.contact_name}</p>
                    )}

                    {/* Stats row */}
                    <div className="grid grid-cols-3 md:grid-cols-7 gap-4 p-3 rounded-lg mb-3"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <StatPill label="Monthly Retainer" value={`$${(c.retainer_price || 0).toLocaleString()}`} color="var(--accent)" />
                      <StatPill label="Jobs Quoted" value={`${c.total_quotes}`} />
                      <StatPill label="Value Quoted" value={fmt$(c.total_quoted_value)} color="var(--yellow)" />
                      <StatPill label="Leads" value={c.cached_leads > 0 ? String(c.cached_leads) : '—'} color="var(--accent)" />
                      <StatPill label="In-Home Consults" value={c.cached_inhome > 0 ? String(c.cached_inhome) : '—'} color="var(--yellow)" />
                      <StatPill label="Revenue Closed" value={fmt$(c.revenue_closed)} color="var(--green)" />
                      <StatPill
                        label="Close Rate"
                        value={c.total_quotes > 0 ? `${closeRate.toFixed(0)}%` : '—'}
                        color={closeRate >= 30 ? 'var(--green)' : closeRate > 0 ? 'var(--yellow)' : undefined}
                      />
                    </div>

                    {/* Next check-in + internal notes */}
                    <div className="flex items-center gap-4 flex-wrap">
                      {c.next_checkin && (
                        <span className="text-xs flex items-center gap-1"
                          style={{ color: isOverdue ? 'var(--red)' : 'var(--text-muted)' }}>
                          <Calendar size={11} />
                          {isOverdue ? 'Overdue check-in · ' : 'Next check-in · '}
                          {new Date(c.next_checkin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {editingNote === c.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            autoFocus
                            className="input text-xs flex-1"
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveNote(c.id); if (e.key === 'Escape') setEditingNote(null); }}
                            placeholder="Internal note…"
                          />
                          <button onClick={() => saveNote(c.id)} disabled={savingNote}
                            className="btn-primary text-xs px-3 py-1.5">Save</button>
                          <button onClick={() => setEditingNote(null)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingNote(c.id); setNoteText(c.internal_notes ?? ''); }}
                          className="text-xs flex items-center gap-1 hover:opacity-70"
                          style={{ color: c.internal_notes ? 'var(--text-muted)' : 'var(--text-muted)', opacity: c.internal_notes ? 1 : 0.5 }}>
                          <StickyNote size={11} />
                          {c.internal_notes ? c.internal_notes : 'Add internal note'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link href={`/dashboard/${c.id}`}
                      className="btn-ghost text-xs flex items-center gap-1.5">
                      Dashboard <ChevronRight size={12} />
                    </Link>
                    {c.rebilling_date && (
                      <span className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                        Renews {new Date(c.rebilling_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

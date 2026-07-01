'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, Users, Star, Phone,
  AlertTriangle, CheckCircle, Clock, XCircle, ChevronRight,
  Plus, Minus, Home, BarChart2, Pause, PhoneCall, X,
  Settings, RefreshCw, Check,
} from 'lucide-react';
import CallNotesSection from '@/components/CallNotesSection';

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
  checkin_count: number;
  testimonial_collected: number;
  cached_leads: number;
  cached_inhome: number;
  total_quotes: number;
  total_quoted_value: number;
  closed_deals: number;
  revenue_closed: number;
  days_as_client: number;
  total_payments_received: number;
}

interface GHLOpp {
  id: string;
  name: string;
  stageName: string;
  updatedAt: string;
}

const STAGES = [
  { key: 'Onboarding', label: 'Onboarding',  icon: <Clock size={13} />,         color: '#6c63ff' },
  { key: 'Launched',   label: 'Launched',     icon: <TrendingUp size={13} />,    color: '#38bdf8' },
  { key: 'Active',     label: 'Active',       icon: <CheckCircle size={13} />,   color: '#22c55e' },
  { key: 'At Risk',    label: 'At Risk',      icon: <AlertTriangle size={13} />, color: '#f59e0b' },
  { key: 'Paused',     label: 'Paused',       icon: <Pause size={13} />,         color: '#94a3b8' },
  { key: 'Churned',    label: 'Churned',      icon: <XCircle size={13} />,       color: '#ef4444' },
];

function fmt$(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function tenure(days: number) {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
}

function monthLabel(days: number) {
  if (days <= 35) return 'Month 1';
  const m = Math.floor(days / 30);
  return `Month ${m}`;
}

function ClientCard({ c, onUpdate, ghlStage }: {
  c: ClientRow;
  onUpdate: (id: number, patch: Partial<ClientRow>) => void;
  ghlStage?: string;
}) {
  const closeRate = c.total_quotes > 0 ? (c.closed_deals / c.total_quotes) * 100 : 0;
  const totalAdSpend = c.ad_spend || (c.daily_ad_spend * c.days_as_client);
  const cpl = c.cached_leads > 0 ? totalAdSpend / c.cached_leads : 0;
  const isCheckinOverdue = c.next_checkin && new Date(c.next_checkin) < new Date();
  const daysUntilBilling = c.rebilling_date
    ? Math.ceil((new Date(c.rebilling_date).getTime() - Date.now()) / 86400000)
    : null;

  async function patch(update: Partial<ClientRow>) {
    onUpdate(c.id, update);
    await fetch('/api/admin/overview', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, ...update }),
    });
  }

  return (
    <div className="card p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0"
            style={{ background: 'var(--accent)' }}>
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{c.name}</p>
            {c.contact_name && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.contact_name}</p>}
          </div>
        </div>
        <Link href={`/dashboard/${c.id}`} className="shrink-0 hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {tenure(c.days_as_client)}
        </span>
        {ghlStage && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(108,99,255,0.12)', color: 'var(--accent)' }}>
            GHL: {ghlStage}
          </span>
        )}
        {daysUntilBilling !== null && daysUntilBilling <= 7 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            Bill in {daysUntilBilling}d
          </span>
        )}
        {c.testimonial_collected ? (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
            <Star size={9} fill="#22c55e" /> Testimonial
          </span>
        ) : null}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2.5 space-y-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Retainer</p>
          <p className="font-bold" style={{ color: 'var(--accent)' }}>{fmt$(c.retainer_price || 0)}/mo</p>
        </div>
        <div className="rounded-lg p-2.5 space-y-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Paid</p>
          <p className="font-bold" style={{ color: 'var(--green)' }}>{fmt$(c.total_payments_received || 0)}</p>
        </div>
        <div className="rounded-lg p-2.5 space-y-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ad Spend Mgd</p>
          <p className="font-bold">{fmt$(totalAdSpend)}</p>
        </div>
        <div className="rounded-lg p-2.5 space-y-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Revenue Won</p>
          <p className="font-bold" style={{ color: 'var(--green)' }}>{fmt$(c.revenue_closed)}</p>
        </div>
        <div className="col-span-2 rounded-lg p-2.5 flex items-center justify-between" style={{
          background: cpl > 0 && cpl <= 50 ? 'rgba(34,197,94,0.08)' : cpl > 150 ? 'rgba(239,68,68,0.08)' : 'var(--surface-2)',
          border: `1px solid ${cpl > 0 && cpl <= 50 ? '#22c55e44' : cpl > 150 ? '#ef444444' : 'var(--border)'}`,
        }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cost Per Lead</p>
          <p className="font-bold text-sm" style={{ color: cpl > 0 && cpl <= 50 ? 'var(--green)' : cpl > 150 ? 'var(--red)' : cpl > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {cpl > 0 ? `$${Math.round(cpl)}` : '—'}
          </p>
        </div>
      </div>

      {/* Pipeline */}
      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1"><Users size={10} /> {c.cached_leads > 0 ? c.cached_leads : '—'} leads</span>
        <span className="opacity-40 mx-0.5">→</span>
        <span className="flex items-center gap-1"><Home size={10} /> {c.cached_inhome > 0 ? c.cached_inhome : '—'} in-home</span>
        <span className="opacity-40 mx-0.5">→</span>
        <span className="flex items-center gap-1" style={{ color: closeRate >= 30 ? 'var(--green)' : 'var(--text-muted)' }}>
          <CheckCircle size={10} /> {c.closed_deals} closed
          {c.total_quotes > 0 && <span className="ml-0.5">({closeRate.toFixed(0)}%)</span>}
        </span>
      </div>

      {/* Check-in tracker */}
      <div className="flex items-center justify-between rounded-lg p-2.5"
        style={{ background: 'var(--surface-2)', border: `1px solid ${isCheckinOverdue ? '#f59e0b44' : 'var(--border)'}` }}>
        <div className="flex items-center gap-1.5">
          <Phone size={11} style={{ color: isCheckinOverdue ? '#f59e0b' : 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isCheckinOverdue ? <span style={{ color: '#f59e0b' }}>Overdue · </span> : ''}
            {c.checkin_count} check-in{c.checkin_count !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => patch({ checkin_count: Math.max(0, c.checkin_count - 1) })}
            className="w-5 h-5 rounded flex items-center justify-center hover:opacity-70"
            style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
            <Minus size={9} />
          </button>
          <button onClick={() => patch({ checkin_count: c.checkin_count + 1 })}
            className="w-5 h-5 rounded flex items-center justify-center hover:opacity-70"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            <Plus size={9} />
          </button>
        </div>
      </div>

      <button
        onClick={() => patch({ testimonial_collected: c.testimonial_collected ? 0 : 1 })}
        className="w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 hover:opacity-80 transition-all"
        style={{
          background: c.testimonial_collected ? 'rgba(34,197,94,0.12)' : 'var(--surface-2)',
          color: c.testimonial_collected ? '#22c55e' : 'var(--text-muted)',
          border: `1px solid ${c.testimonial_collected ? '#22c55e44' : 'var(--border)'}`,
        }}>
        <Star size={11} fill={c.testimonial_collected ? '#22c55e' : 'none'} />
        {c.testimonial_collected ? 'Testimonial Collected' : 'Mark Testimonial Collected'}
      </button>

      {c.internal_notes && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>💬 {c.internal_notes}</p>
      )}
    </div>
  );
}

// ── GHL Settings Panel ────────────────────────────────────────────────────────
function GHLSettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [locationId, setLocationId] = useState('');
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function fetchPipelines() {
    setLoading(true);
    await fetch('/api/admin/agency-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_ghl_location_id: locationId }),
    });
    const res = await fetch('/api/admin/agency-pipeline');
    const data = await res.json();
    if (data.pipelines) setPipelines(data.pipelines);
    setLoading(false);
  }

  async function save() {
    setLoading(true);
    await fetch('/api/admin/agency-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_ghl_pipeline_id: selectedPipeline }),
    });
    setSaved(true);
    setTimeout(() => { onSaved(); onClose(); }, 800);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Agency GHL Pipeline</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Connect your Customer Success pipeline to sync check-in stages for Month 1 clients.
          Find your Location ID in GHL → Settings → Business Info.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>GHL Location ID</label>
          <div className="flex gap-2">
            <input className="input flex-1" value={locationId} onChange={e => setLocationId(e.target.value)}
              placeholder="e.g. abc123xyz" />
            <button onClick={fetchPipelines} disabled={!locationId || loading} className="btn-ghost text-sm whitespace-nowrap">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : 'Load Pipelines'}
            </button>
          </div>
        </div>
        {pipelines.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Customer Success Pipeline</label>
            <select className="input" value={selectedPipeline} onChange={e => setSelectedPipeline(e.target.value)}>
              <option value="">— Select pipeline —</option>
              {pipelines.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        {selectedPipeline && (
          <button onClick={save} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {saved ? <><Check size={14} /> Saved!</> : 'Save & Sync'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrackerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [activeView, setActiveView] = useState<'kanban' | 'months'>('months');
  const [ghlOpps, setGhlOpps] = useState<GHLOpp[]>([]);
  const [showGHLSettings, setShowGHLSettings] = useState(false);
  const [ghlConfigured, setGhlConfigured] = useState(false);

  useEffect(() => {
    const user = session?.user as any;
    if (status === 'unauthenticated' || (session && user?.role !== 'admin')) router.push('/login');
  }, [status, session, router]);

  const loadData = useCallback(async () => {
    if (status !== 'authenticated') return;
    const [overviewRes, ghlRes] = await Promise.all([
      fetch('/api/admin/overview'),
      fetch('/api/admin/agency-pipeline'),
    ]);
    const data = await overviewRes.json();
    setClients(Array.isArray(data) ? data : []);
    if (ghlRes.ok) {
      const ghl = await ghlRes.json();
      if (ghl.configured && ghl.opportunities) {
        setGhlOpps(ghl.opportunities);
        setGhlConfigured(true);
      }
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleUpdate(id: number, patch: Partial<ClientRow>) {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  async function moveToStage(clientId: number, stage: string) {
    handleUpdate(clientId, { client_status: stage } as any);
    await fetch('/api/admin/overview', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clientId, client_status: stage }),
    });
  }

  // Match GHL opp to client by name (fuzzy)
  function getGHLStage(client: ClientRow): string | undefined {
    const opp = ghlOpps.find(o =>
      o.name.toLowerCase().includes(client.name.toLowerCase()) ||
      client.name.toLowerCase().includes(o.name.toLowerCase())
    );
    return opp?.stageName;
  }

  const active = clients.filter(c => c.client_status !== 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);
  const totalRevenue = clients.reduce((s, c) => s + c.revenue_closed, 0);
  const totalPaid = clients.reduce((s, c) => s + (c.total_payments_received || 0), 0);
  const atRisk = clients.filter(c => c.client_status === 'At Risk').length;

  // Month cohort grouping (exclude churned)
  const activeClients = clients.filter(c => c.client_status !== 'Churned');
  const monthGroups = activeClients.reduce((acc, c) => {
    const label = monthLabel(c.days_as_client);
    if (!acc[label]) acc[label] = [];
    acc[label].push(c);
    return acc;
  }, {} as Record<string, ClientRow[]>);

  // Sort month tabs: Month 1 first, then Month 2, 3, ...
  const sortedMonths = Object.keys(monthGroups).sort((a, b) => {
    const na = parseInt(a.split(' ')[1]);
    const nb = parseInt(b.split(' ')[1]);
    return na - nb;
  });

  const [activeMonth, setActiveMonth] = useState<string>('');
  useEffect(() => {
    if (sortedMonths.length && !activeMonth) setActiveMonth(sortedMonths[0]);
  }, [sortedMonths.join(',')]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading tracker…</p>
    </div>
  );

  const currentMonthClients = monthGroups[activeMonth] ?? [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            Admin
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2">
            <BarChart2 size={15} style={{ color: 'var(--accent)' }} /> Client Tracker
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setActiveView('months')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{ background: activeView === 'months' ? 'var(--accent)' : 'transparent', color: activeView === 'months' ? '#fff' : 'var(--text-muted)' }}>
              By Month
            </button>
            <button
              onClick={() => setActiveView('kanban')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{ background: activeView === 'kanban' ? 'var(--surface)' : 'transparent', color: activeView === 'kanban' ? 'var(--text)' : 'var(--text-muted)' }}>
              Kanban
            </button>
          </div>
          <button onClick={() => setShowGHLSettings(true)}
            className="btn-ghost text-sm flex items-center gap-1.5">
            <Settings size={14} />
            {ghlConfigured ? 'GHL ✓' : 'Connect GHL'}
          </button>
        </div>
      </nav>

      <div className="px-6 py-6 space-y-6">
        {/* Agency Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Active Clients',    value: String(active.length),  icon: <Users size={14} />,        color: 'var(--accent)' },
            { label: 'Monthly Retainer',  value: fmt$(totalMRR),         icon: <DollarSign size={14} />,   color: 'var(--green)' },
            { label: 'Total Collected',   value: fmt$(totalPaid),        icon: <DollarSign size={14} />,   color: 'var(--green)' },
            { label: 'Revenue Generated', value: fmt$(totalRevenue),     icon: <TrendingUp size={14} />,   color: 'var(--green)' },
            { label: 'At Risk',           value: String(atRisk),         icon: <AlertTriangle size={14}/>, color: atRisk > 0 ? '#f59e0b' : 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} className="card p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${s.color}22`, color: s.color }}>
                {s.icon}
              </div>
              <div>
                <p className="text-xl font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Month Cohort View ──────────────────────────────────────── */}
        {activeView === 'months' && (
          <div className="space-y-4">
            {/* Month tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sortedMonths.map(m => {
                const count = monthGroups[m].length;
                const isM1 = m === 'Month 1';
                return (
                  <button
                    key={m}
                    onClick={() => setActiveMonth(m)}
                    className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                    style={{
                      background: activeMonth === m ? 'var(--accent)' : 'var(--surface)',
                      color: activeMonth === m ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${activeMonth === m ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    {m}
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
                      background: activeMonth === m ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)',
                      color: activeMonth === m ? '#fff' : 'var(--text-muted)',
                    }}>{count}</span>
                    {isM1 && ghlConfigured && <span className="text-xs opacity-70">· GHL</span>}
                  </button>
                );
              })}
              {/* Churned tab */}
              <button
                onClick={() => setActiveMonth('Churned')}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                style={{
                  background: activeMonth === 'Churned' ? '#ef4444' : 'var(--surface)',
                  color: activeMonth === 'Churned' ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${activeMonth === 'Churned' ? '#ef4444' : 'var(--border)'}`,
                }}>
                Churned
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
                  background: activeMonth === 'Churned' ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)',
                  color: activeMonth === 'Churned' ? '#fff' : 'var(--text-muted)',
                }}>{clients.filter(c => c.client_status === 'Churned').length}</span>
              </button>
            </div>

            {/* Month 1: show GHL stage banner */}
            {activeMonth === 'Month 1' && ghlConfigured && (
              <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
                style={{ background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)' }}>
                <CheckCircle size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--accent)' }}>Synced with GHL Customer Success pipeline — stages shown on cards</span>
              </div>
            )}

            {/* Month header info */}
            {activeMonth !== 'Churned' && currentMonthClients.length > 0 && (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{activeMonth}</h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {activeMonth === 'Month 1'
                      ? `First month clients — 2 check-in calls tracked in GHL`
                      : `Clients in their ${activeMonth.toLowerCase()} — ${currentMonthClients.length} client${currentMonthClients.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Combined MRR</p>
                  <p className="font-bold text-lg" style={{ color: 'var(--green)' }}>
                    {fmt$(currentMonthClients.reduce((s, c) => s + (c.retainer_price || 0), 0))}
                  </p>
                </div>
              </div>
            )}

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(activeMonth === 'Churned'
                ? clients.filter(c => c.client_status === 'Churned')
                : currentMonthClients
              ).map(c => (
                <div key={c.id} className="cursor-pointer" onClick={() => setSelectedClient(c)}>
                  <ClientCard
                    c={c}
                    onUpdate={handleUpdate}
                    ghlStage={activeMonth === 'Month 1' ? getGHLStage(c) : undefined}
                  />
                </div>
              ))}
              {(activeMonth === 'Churned'
                ? clients.filter(c => c.client_status === 'Churned').length === 0
                : currentMonthClients.length === 0
              ) && (
                <div className="col-span-full text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
                  No clients in {activeMonth}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Kanban View ────────────────────────────────────────────── */}
        {activeView === 'kanban' && (
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 600 }}>
            {STAGES.map(stage => {
              const stageClients = clients.filter(c => c.client_status === stage.key);
              return (
                <div
                  key={stage.key}
                  className="shrink-0 flex flex-col rounded-xl"
                  style={{ width: 280, background: 'var(--surface)', border: '1px solid var(--border)' }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (dragging !== null) moveToStage(dragging, stage.key); setDragging(null); }}
                >
                  <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded flex items-center justify-center"
                          style={{ background: `${stage.color}22`, color: stage.color }}>
                          {stage.icon}
                        </div>
                        <span className="font-semibold text-sm">{stage.label}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${stage.color}22`, color: stage.color }}>
                        {stageClients.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                    {stageClients.length === 0 && (
                      <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>No clients</div>
                    )}
                    {stageClients.map(c => (
                      <div key={c.id} draggable onDragStart={() => setDragging(c.id)} onDragEnd={() => setDragging(null)}
                        className="cursor-grab active:cursor-grabbing" onClick={() => setSelectedClient(c)}>
                        <ClientCard c={c} onUpdate={handleUpdate} ghlStage={getGHLStage(c)} />
                      </div>
                    ))}
                  </div>
                  {dragging !== null && !stageClients.find(c => c.id === dragging) && (
                    <div className="mx-3 mb-3 border-2 border-dashed rounded-xl p-3 text-center text-xs"
                      style={{ borderColor: stage.color, color: stage.color }}>
                      Drop to move to {stage.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Call Notes Drawer */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedClient(null); }}>
          <div className="w-full max-w-2xl h-full overflow-y-auto flex flex-col"
            style={{ background: 'var(--background)', borderLeft: '1px solid var(--border)' }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ background: 'var(--accent)' }}>
                  {selectedClient.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">{selectedClient.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {tenure(selectedClient.days_as_client)} · {selectedClient.client_status}
                    {getGHLStage(selectedClient) && ` · GHL: ${getGHLStage(selectedClient)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/dashboard/${selectedClient.id}`} className="btn-ghost text-sm flex items-center gap-1.5">
                  Full Dashboard <ChevronRight size={13} />
                </Link>
                <button onClick={() => setSelectedClient(null)} className="hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <CallNotesSection clientId={selectedClient.id} isAdmin={true} />
            </div>
          </div>
        </div>
      )}

      {showGHLSettings && (
        <GHLSettingsPanel
          onClose={() => setShowGHLSettings(false)}
          onSaved={() => { setShowGHLSettings(false); loadData(); }}
        />
      )}
    </div>
  );
}

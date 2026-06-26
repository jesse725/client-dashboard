'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, DollarSign, TrendingUp, Users, Star, Phone,
  AlertTriangle, CheckCircle, Clock, XCircle, ChevronRight,
  Plus, Minus, Home, BarChart2, Pause,
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

const STAGES = [
  { key: 'Onboarding', label: 'Onboarding',  icon: <Clock size={13} />,         color: '#6c63ff', desc: 'Setting up & getting started' },
  { key: 'Launched',   label: 'Launched',     icon: <TrendingUp size={13} />,    color: '#38bdf8', desc: 'Ads live, results incoming' },
  { key: 'Active',     label: 'Active',       icon: <CheckCircle size={13} />,   color: '#22c55e', desc: 'Running strong' },
  { key: 'At Risk',    label: 'At Risk',      icon: <AlertTriangle size={13} />, color: '#f59e0b', desc: 'Needs attention' },
  { key: 'Paused',     label: 'Paused',       icon: <Pause size={13} />,         color: '#94a3b8', desc: 'Temporarily on hold' },
  { key: 'Churned',    label: 'Churned',      icon: <XCircle size={13} />,       color: '#ef4444', desc: 'No longer active' },
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

function ClientCard({ c, onUpdate }: { c: ClientRow; onUpdate: (id: number, patch: Partial<ClientRow>) => void }) {
  const closeRate = c.total_quotes > 0 ? (c.closed_deals / c.total_quotes) * 100 : 0;
  const totalAdSpend = c.ad_spend || (c.daily_ad_spend * c.days_as_client);
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
      {/* Header */}
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

      {/* Tenure + billing */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          🕐 {tenure(c.days_as_client)}
        </span>
        {daysUntilBilling !== null && daysUntilBilling <= 7 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            💳 Bill in {daysUntilBilling}d
          </span>
        )}
        {c.testimonial_collected ? (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
            <Star size={9} fill="#22c55e" /> Testimonial
          </span>
        ) : null}
      </div>

      {/* Core agency stats */}
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
      </div>

      {/* Results pipeline */}
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
            {isCheckinOverdue ? <span style={{ color: '#f59e0b' }}>Overdue check-in · </span> : ''}
            {c.checkin_count} call{c.checkin_count !== 1 ? 's' : ''} completed
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

      {/* Testimonial toggle */}
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

      {/* Internal note */}
      {c.internal_notes && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>💬 {c.internal_notes}</p>
      )}
    </div>
  );
}

export default function TrackerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    const user = session?.user as any;
    if (status === 'unauthenticated' || (session && user?.role !== 'admin')) router.push('/login');
  }, [status, session, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/admin/overview').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, [status]);

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

  const active = clients.filter(c => c.client_status !== 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);
  const totalRevenue = clients.reduce((s, c) => s + c.revenue_closed, 0);
  const totalPaid = clients.reduce((s, c) => s + (c.total_payments_received || 0), 0);
  const atRisk = clients.filter(c => c.client_status === 'At Risk').length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading tracker…</p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <Link href="/admin" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Admin
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="font-semibold flex items-center gap-2">
          <BarChart2 size={15} style={{ color: 'var(--accent)' }} /> Client Tracker
        </span>
      </nav>

      <div className="px-6 py-6 space-y-6">
        {/* ── Agency Summary ───────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Active Clients',     value: String(active.length),     icon: <Users size={14} />,       color: 'var(--accent)' },
            { label: 'Monthly Retainer',   value: fmt$(totalMRR),            icon: <DollarSign size={14} />,  color: 'var(--green)' },
            { label: 'Total Collected',    value: fmt$(totalPaid),           icon: <DollarSign size={14} />,  color: 'var(--green)' },
            { label: 'Revenue Generated',  value: fmt$(totalRevenue),        icon: <TrendingUp size={14} />,  color: 'var(--green)' },
            { label: 'At Risk',            value: String(atRisk),            icon: <AlertTriangle size={14}/>, color: atRisk > 0 ? '#f59e0b' : 'var(--text-muted)' },
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

        {/* ── Kanban Board ─────────────────────────────── */}
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 600 }}>
          {STAGES.map(stage => {
            const stageClients = clients.filter(c => c.client_status === stage.key);
            return (
              <div
                key={stage.key}
                className="shrink-0 flex flex-col rounded-xl"
                style={{
                  width: 280,
                  background: 'var(--surface)',
                  border: `1px solid var(--border)`,
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (dragging !== null) moveToStage(dragging, stage.key);
                  setDragging(null);
                }}
              >
                {/* Column header */}
                <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between mb-1">
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
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
                </div>

                {/* Cards */}
                <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                  {stageClients.length === 0 && (
                    <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                      No clients
                    </div>
                  )}
                  {stageClients.map(c => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragging(c.id)}
                      onDragEnd={() => setDragging(null)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <ClientCard c={c} onUpdate={handleUpdate} />
                    </div>
                  ))}
                </div>

                {/* Drop hint */}
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
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, Users, Star, Phone, AlertTriangle,
  CheckCircle, Clock, XCircle, ChevronRight, Plus, Minus,
  Home, BarChart2, Pause, PhoneCall, X, RefreshCw,
  Smile, Meh, Frown, Table2, Kanban, Calendar,
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
  closed_deals: number;
  revenue_closed: number;
  days_as_client: number;
  total_payments_received: number;
  latest_sentiment: string | null;
}

// GHL Client Success pipeline stage → kanban column mapping
const GHL_STAGE_MAP: Record<string, string> = {
  '37b4984c-ced0-4c4a-ae9e-075c0652ca68': 'Onboarding',
  '9e3dd044-95f9-4d69-8a2c-062c51a7f131': 'Launching',
  '524b1068-7c7e-4027-bf29-19732b1c3550': '14 Day Check-in',
  'fe24f411-4ef3-485f-b459-b466a7732ffd': '28 Day Check-in',
  '975f12bd-28b9-4266-be98-ec6c9d7c6ee0': 'Month 1',
  '4ec09a2f-5207-4c28-afb3-474483044f53': 'Month 1',
};

const GHL_REVERSE_MAP: Record<string, string> = {
  'Onboarding':       '37b4984c-ced0-4c4a-ae9e-075c0652ca68',
  'Launching':        '9e3dd044-95f9-4d69-8a2c-062c51a7f131',
  '14 Day Check-in':  '524b1068-7c7e-4027-bf29-19732b1c3550',
  '28 Day Check-in':  'fe24f411-4ef3-485f-b459-b466a7732ffd',
};

const KANBAN_STAGES = [
  { key: 'Onboarding',      label: 'Onboarding',      color: '#6c63ff', ghl: true,  desc: 'Signed & setting up' },
  { key: 'Launching',       label: 'Launching',       color: '#38bdf8', ghl: true,  desc: 'Ads going live' },
  { key: '14 Day Check-in', label: '14 Day Check-in', color: '#a78bfa', ghl: true,  desc: 'First check-in call' },
  { key: '28 Day Check-in', label: '28 Day Check-in', color: '#f59e0b', ghl: true,  desc: 'Second check-in call' },
  { key: 'Month 1',         label: 'Month 1',         color: '#22c55e', ghl: false, desc: '30–60 days in' },
  { key: 'Month 2',         label: 'Month 2',         color: '#10b981', ghl: false, desc: '60–90 days in' },
  { key: 'Month 3+',        label: 'Month 3+',        color: '#0ea5e9', ghl: false, desc: '90+ days — long term' },
  { key: 'At Risk',         label: 'At Risk',         color: '#ef4444', ghl: false, desc: 'Needs urgent attention' },
  { key: 'Churned',         label: 'Churned',         color: '#64748b', ghl: false, desc: 'No longer active' },
];

const SENTIMENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  happy:   { icon: <Smile size={12} />,  color: '#22c55e', label: 'Happy' },
  neutral: { icon: <Meh size={12} />,    color: '#f59e0b', label: 'Neutral' },
  unhappy: { icon: <Frown size={12} />,  color: '#ef4444', label: 'Unhappy' },
};

function fmt$(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function tenure(days: number) {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
}
function autoStage(c: ClientRow): string {
  if (c.client_status === 'At Risk' || c.client_status === 'Churned') return c.client_status;
  const d = c.days_as_client;
  if (d <= 35) return 'Onboarding';
  if (d <= 50) return 'Launching';
  if (d <= 65) return '14 Day Check-in';
  if (d <= 80) return '28 Day Check-in';
  if (d <= 95) return 'Month 1';
  if (d <= 125) return 'Month 2';
  return 'Month 3+';
}

// ── Kanban Card ───────────────────────────────────────────────────────────────
function KanbanCard({ c, onUpdate, ghlStage, onClick }: {
  c: ClientRow; onUpdate: (id: number, patch: Partial<ClientRow>) => void;
  ghlStage?: string; onClick: () => void;
}) {
  const totalAdSpend = c.ad_spend || (c.daily_ad_spend * c.days_as_client);
  const cpl = c.cached_leads > 0 ? totalAdSpend / c.cached_leads : 0;
  const sentiment = c.latest_sentiment ? SENTIMENT_CONFIG[c.latest_sentiment] : null;
  const daysUntilBilling = c.rebilling_date
    ? Math.ceil((new Date(c.rebilling_date).getTime() - Date.now()) / 86400000) : null;

  async function patch(update: Partial<ClientRow>) {
    onUpdate(c.id, update);
    await fetch('/api/admin/overview', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, ...update }) });
  }

  return (
    <div className="card p-3.5 space-y-2.5 text-sm cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ background: 'var(--accent)' }}>
            {c.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{c.name}</p>
            {c.contact_name && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.contact_name}</p>}
          </div>
        </div>
        {sentiment && (
          <span className="flex items-center gap-1 text-xs shrink-0 px-1.5 py-0.5 rounded-full" style={{ background: `${sentiment.color}18`, color: sentiment.color }}>
            {sentiment.icon} {sentiment.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {tenure(c.days_as_client)}
        </span>
        {ghlStage && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(108,99,255,0.12)', color: 'var(--accent)' }}>
            GHL ✓
          </span>
        )}
        {daysUntilBilling !== null && daysUntilBilling <= 7 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            Bill {daysUntilBilling}d
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="rounded p-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--text-muted)' }}>Retainer</p>
          <p className="font-bold" style={{ color: 'var(--accent)' }}>{fmt$(c.retainer_price || 0)}/mo</p>
        </div>
        <div className="rounded p-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--text-muted)' }}>CPL</p>
          <p className="font-bold" style={{ color: cpl > 0 && cpl <= 50 ? 'var(--green)' : cpl > 150 ? 'var(--red)' : cpl > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {cpl > 0 ? `$${Math.round(cpl)}` : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{c.cached_leads > 0 ? `${c.cached_leads} leads` : '— leads'}</span>
        <span>·</span>
        <span>{c.closed_deals} closed</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <PhoneCall size={9} />
          <span>{c.checkin_count}</span>
          <button onClick={e => { e.stopPropagation(); patch({ checkin_count: Math.max(0, c.checkin_count - 1) }); }}
            className="w-4 h-4 rounded flex items-center justify-center" style={{ background: 'var(--border)' }} >
            <Minus size={7} />
          </button>
          <button onClick={e => { e.stopPropagation(); patch({ checkin_count: c.checkin_count + 1 }); }}
            className="w-4 h-4 rounded flex items-center justify-center" style={{ background: 'var(--accent)', color: '#fff' }}>
            <Plus size={7} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overview Table ────────────────────────────────────────────────────────────
function OverviewTable({ clients, onSelect }: { clients: ClientRow[]; onSelect: (c: ClientRow) => void }) {
  const active = clients.filter(c => c.client_status !== 'Churned');

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Active Clients',   value: String(active.length),                                          color: 'var(--accent)' },
          { label: 'MRR',              value: fmt$(active.reduce((s, c) => s + (c.retainer_price || 0), 0)), color: 'var(--green)' },
          { label: 'Total Leads',      value: String(active.reduce((s, c) => s + c.cached_leads, 0)),        color: 'var(--yellow)' },
          { label: 'Jobs Closed',      value: String(active.reduce((s, c) => s + c.closed_deals, 0)),        color: 'var(--green)' },
          { label: 'At Risk',          value: String(clients.filter(c => c.client_status === 'At Risk').length), color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="card px-4 py-3 flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <span className="font-bold text-lg" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Client', 'Stage', 'Tenure', 'Retainer', 'CPL', 'Leads', 'In-Home', 'Jobs Closed', 'Close %', 'Check-ins', 'Sentiment', 'Next Billing'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => {
                const totalAdSpend = c.ad_spend || (c.daily_ad_spend * c.days_as_client);
                const cpl = c.cached_leads > 0 ? totalAdSpend / c.cached_leads : 0;
                const closeRate = c.total_quotes > 0 ? (c.closed_deals / c.total_quotes) * 100 : 0;
                const sentiment = c.latest_sentiment ? SENTIMENT_CONFIG[c.latest_sentiment] : null;
                const stage = KANBAN_STAGES.find(s => s.key === c.client_status) ?? KANBAN_STAGES.find(s => s.key === autoStage(c));
                const daysUntilBilling = c.rebilling_date
                  ? Math.ceil((new Date(c.rebilling_date).getTime() - Date.now()) / 86400000) : null;

                return (
                  <tr key={c.id}
                    className="hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                    style={{ borderBottom: i < clients.length - 1 ? '1px solid var(--border)' : 'none' }}
                    onClick={() => onSelect(c)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ background: 'var(--accent)' }}>
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.contact_name && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.contact_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${stage?.color ?? '#888'}18`, color: stage?.color ?? '#888' }}>
                        {c.client_status || autoStage(c)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{tenure(c.days_as_client)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--accent)' }}>{fmt$(c.retainer_price || 0)}/mo</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: cpl > 0 && cpl <= 50 ? 'var(--green)' : cpl > 150 ? 'var(--red)' : cpl > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
                      {cpl > 0 ? `$${Math.round(cpl)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">{c.cached_leads > 0 ? c.cached_leads : '—'}</td>
                    <td className="px-4 py-3 text-center">{c.cached_inhome > 0 ? c.cached_inhome : '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold" style={{ color: 'var(--green)' }}>{c.closed_deals}</td>
                    <td className="px-4 py-3 text-center" style={{ color: closeRate >= 30 ? 'var(--green)' : closeRate > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
                      {c.total_quotes > 0 ? `${closeRate.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <PhoneCall size={11} /> {c.checkin_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sentiment ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: `${sentiment.color}18`, color: sentiment.color }}>
                          {sentiment.icon} {sentiment.label}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: daysUntilBilling !== null && daysUntilBilling <= 7 ? '#f59e0b' : 'var(--text-muted)' }}>
                      {c.rebilling_date ? new Date(c.rebilling_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Month Cohort View ─────────────────────────────────────────────────────────
function MonthView({ clients, onSelect }: { clients: ClientRow[]; onSelect: (c: ClientRow) => void }) {
  function monthLabel(days: number) {
    if (days <= 35) return 'Month 1';
    return `Month ${Math.floor(days / 30)}`;
  }

  const groups = clients.filter(c => c.client_status !== 'Churned').reduce((acc, c) => {
    const label = monthLabel(c.days_as_client);
    if (!acc[label]) acc[label] = [];
    acc[label].push(c);
    return acc;
  }, {} as Record<string, ClientRow[]>);

  const sortedMonths = Object.keys(groups).sort((a, b) => parseInt(a.split(' ')[1]) - parseInt(b.split(' ')[1]));
  const [active, setActive] = useState('');
  useEffect(() => { if (sortedMonths.length && !active) setActive(sortedMonths[0]); }, [sortedMonths.join(',')]);

  const current = groups[active] ?? [];
  const churned = clients.filter(c => c.client_status === 'Churned');

  return (
    <div className="space-y-4">
      {/* Month tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sortedMonths.map(m => (
          <button key={m} onClick={() => setActive(m)}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{ background: active === m ? 'var(--accent)' : 'var(--surface)', color: active === m ? '#fff' : 'var(--text-muted)', border: `1px solid ${active === m ? 'var(--accent)' : 'var(--border)'}` }}>
            {m}
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: active === m ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)', color: active === m ? '#fff' : 'var(--text-muted)' }}>
              {groups[m].length}
            </span>
          </button>
        ))}
        <button onClick={() => setActive('Churned')}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
          style={{ background: active === 'Churned' ? '#64748b' : 'var(--surface)', color: active === 'Churned' ? '#fff' : 'var(--text-muted)', border: `1px solid ${active === 'Churned' ? '#64748b' : 'var(--border)'}` }}>
          Churned <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: active === 'Churned' ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)' }}>{churned.length}</span>
        </button>
      </div>

      {/* Header */}
      {active !== 'Churned' && current.length > 0 && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">{active}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {active === 'Month 1' ? 'First month — 2 check-in calls tracked in GHL' : `${current.length} client${current.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <p className="font-bold text-lg" style={{ color: 'var(--green)' }}>
            {fmt$(current.reduce((s, c) => s + (c.retainer_price || 0), 0))}/mo
          </p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(active === 'Churned' ? churned : current).map(c => (
          <div key={c.id} onClick={() => onSelect(c)} className="cursor-pointer">
            <KanbanCard c={c} onUpdate={() => {}} ghlStage={undefined} onClick={() => onSelect(c)} />
          </div>
        ))}
        {(active === 'Churned' ? churned : current).length === 0 && (
          <div className="col-span-full text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>No clients in {active}</div>
        )}
      </div>
    </div>
  );
}

// ── Internal View ─────────────────────────────────────────────────────────────
function InternalView({ clients }: { clients: ClientRow[] }) {
  const active = clients.filter(c => c.client_status !== 'Churned');
  const churned = clients.filter(c => c.client_status === 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);
  const totalLTV = clients.reduce((s, c) => s + (c.total_payments_received || 0), 0);
  const churnRate = clients.length > 0 ? (churned.length / clients.length) * 100 : 0;
  const testimonials = clients.filter(c => c.testimonial_collected).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'MRR',              value: fmt$(totalMRR),                       sub: `${active.length} active clients`,    color: 'var(--green)' },
          { label: 'Total LTV',        value: fmt$(totalLTV),                       sub: 'All-time payments received',         color: 'var(--accent)' },
          { label: 'Churn Rate',       value: `${churnRate.toFixed(1)}%`,           sub: `${churned.length} churned`,          color: churnRate > 20 ? 'var(--red)' : churnRate > 10 ? 'var(--yellow)' : 'var(--green)' },
          { label: 'Testimonials',     value: `${testimonials}/${clients.length}`,  sub: 'Collected',                          color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="card px-4 py-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="font-bold text-2xl" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-client MRR & LTV table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <p className="font-semibold text-sm">Client Financial Breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Client', 'Status', 'MRR', 'Tenure', 'LTV', 'Revenue Closed', 'Testimonial'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => {
                const ltv = c.total_payments_received || 0;
                const isChurned = c.client_status === 'Churned';
                return (
                  <tr key={c.id}
                    className="hover:bg-[var(--surface-2)] transition-colors"
                    style={{ borderBottom: i < clients.length - 1 ? '1px solid var(--border)' : 'none', opacity: isChurned ? 0.5 : 1 }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ background: isChurned ? '#64748b' : 'var(--accent)' }}>
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.contact_name && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.contact_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: isChurned ? 'rgba(100,116,139,0.15)' : 'rgba(34,197,94,0.15)', color: isChurned ? '#64748b' : '#22c55e' }}>
                        {isChurned ? 'Churned' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: isChurned ? 'var(--text-muted)' : 'var(--green)' }}>
                      {isChurned ? '—' : fmt$(c.retainer_price || 0) + '/mo'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{tenure(c.days_as_client)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--accent)' }}>{fmt$(ltv)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--green)' }}>
                      {c.revenue_closed > 0 ? fmt$(c.revenue_closed) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.testimonial_collected ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>✓ Collected</span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Not yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Churned detail */}
      {churned.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <p className="font-semibold text-sm" style={{ color: '#ef4444' }}>Churned Clients ({churned.length})</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {churned.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Was paying {fmt$(c.retainer_price || 0)}/mo · {tenure(c.days_as_client)} tenure</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold" style={{ color: 'var(--accent)' }}>{fmt$(c.total_payments_received || 0)} LTV</p>
                  {c.testimonial_collected && <p className="text-xs" style={{ color: '#22c55e' }}>Testimonial ✓</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const [view, setView] = useState<'overview' | 'kanban' | 'months' | 'internal'>('overview');
  const [ghlOpps, setGhlOpps] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

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
      if (ghl.configured && ghl.opportunities) setGhlOpps(ghl.opportunities);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleUpdate(id: number, patch: Partial<ClientRow>) {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function getGHLOpp(c: ClientRow) {
    return ghlOpps.find(o =>
      o.name.toLowerCase().includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(o.name.toLowerCase())
    );
  }

  function getEffectiveStage(c: ClientRow): string {
    if (c.client_status === 'At Risk' || c.client_status === 'Churned') return c.client_status;
    const opp = getGHLOpp(c);
    if (opp) return GHL_STAGE_MAP[opp.stageId] ?? c.client_status ?? autoStage(c);
    return c.client_status && KANBAN_STAGES.find(s => s.key === c.client_status) ? c.client_status : autoStage(c);
  }

  async function moveToStage(clientId: number, stage: string) {
    handleUpdate(clientId, { client_status: stage } as any);
    await fetch('/api/admin/overview', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clientId, client_status: stage }),
    });
  }

  async function syncGHL() {
    setSyncing(true);
    await loadData();
    setSyncing(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading tracker…</p>
    </div>
  );

  const active = clients.filter(c => c.client_status !== 'Churned');
  const totalMRR = active.reduce((s, c) => s + (c.retainer_price || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>Admin</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2">
            <BarChart2 size={15} style={{ color: 'var(--accent)' }} /> Client Tracker
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>{fmt$(totalMRR)}/mo MRR</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View tabs */}
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {([
              { key: 'overview',  label: 'Overview',  icon: <Table2 size={13} /> },
              { key: 'kanban',    label: 'Journey',   icon: <Kanban size={13} /> },
              { key: 'months',    label: 'Months',    icon: <Calendar size={13} /> },
              { key: 'internal',  label: 'Internal',  icon: <DollarSign size={13} /> },
            ] as const).map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all"
                style={{ background: view === v.key ? 'var(--accent)' : 'transparent', color: view === v.key ? '#fff' : 'var(--text-muted)' }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <button onClick={syncGHL} disabled={syncing} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {ghlOpps.length > 0 ? `GHL (${ghlOpps.length})` : 'Sync GHL'}
          </button>
        </div>
      </nav>

      <div className="px-6 py-6">
        {view === 'overview' && <OverviewTable clients={clients} onSelect={setSelectedClient} />}

        {view === 'months' && <MonthView clients={clients} onSelect={setSelectedClient} />}

        {view === 'internal' && <InternalView clients={clients} />}

        {/* ── Journey / Kanban ─────────────────────────────────────── */}
        {view === 'kanban' && (
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 600 }}>
            {KANBAN_STAGES.map(stage => {
              const stageClients = clients.filter(c => getEffectiveStage(c) === stage.key);
              return (
                <div key={stage.key} className="shrink-0 flex flex-col rounded-xl"
                  style={{ width: 260, background: 'var(--surface)', border: '1px solid var(--border)' }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (dragging !== null) moveToStage(dragging, stage.key); setDragging(null); }}>
                  <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                        <span className="font-semibold text-sm">{stage.label}</span>
                        {stage.ghl && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,99,255,0.12)', color: 'var(--accent)' }}>GHL</span>}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${stage.color}22`, color: stage.color }}>{stageClients.length}</span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
                  </div>
                  <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto">
                    {stageClients.length === 0 && (
                      <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>Empty</div>
                    )}
                    {stageClients.map(c => (
                      <div key={c.id} draggable onDragStart={() => setDragging(c.id)} onDragEnd={() => setDragging(null)} className="cursor-grab active:cursor-grabbing">
                        <KanbanCard c={c} onUpdate={handleUpdate} ghlStage={getGHLOpp(c)?.stageName} onClick={() => setSelectedClient(c)} />
                      </div>
                    ))}
                  </div>
                  {dragging !== null && !stageClients.find(c => c.id === dragging) && (
                    <div className="mx-2.5 mb-2.5 border-2 border-dashed rounded-lg p-2 text-center text-xs" style={{ borderColor: stage.color, color: stage.color }}>
                      Move here
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
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: 'var(--accent)' }}>
                  {selectedClient.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold">{selectedClient.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {tenure(selectedClient.days_as_client)} · {getEffectiveStage(selectedClient)}
                    {selectedClient.latest_sentiment && ` · ${SENTIMENT_CONFIG[selectedClient.latest_sentiment]?.label}`}
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
    </div>
  );
}

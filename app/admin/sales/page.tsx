'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart2, TrendingUp, Phone, PhoneCall, DollarSign,
  RefreshCw, X, ChevronDown, Check, Users, Target,
  Calendar, AlertTriangle, Kanban, Table2,
} from 'lucide-react';

// ── Pipeline config (Merova AV Pipeline) ─────────────────────────────────────
const PIPELINE_ID = '11VwMme2JncYTm2Kq6ky';

const STAGES = [
  { id: '1b69c192-5845-4de2-8f04-954729012a40', name: 'New Lead',                    color: '#6c63ff', group: 'lead' },
  { id: 'd61044d7-af41-413c-b3c6-9ca6af5cb0d5', name: 'Lead Double Dialed No Book',  color: '#ec4899', group: 'lead' },
  { id: '1ea60465-6a38-4719-8f92-0084eb694358', name: 'Responsive Lead',              color: '#0891b2', group: 'lead' },
  { id: 'e63c207c-a47b-4c22-b863-167e77650450', name: 'Strategy Call Booked',         color: '#8b5cf6', group: 'booked' },
  { id: '75f193ff-1c21-4317-a650-5d72585f8a20', name: 'Rescheduled',                  color: '#78716c', group: 'booked' },
  { id: '334b75ae-9674-47f6-b7d6-ec9fbf839556', name: 'No-showed',                    color: '#e11d48', group: 'noshow' },
  { id: 'd5446b31-4839-4da4-942d-04fc52cabf8e', name: 'Follow Up Required',            color: '#f97316', group: 'followup' },
  { id: '3a0f32cd-9cc0-4652-b5f9-ce06a6e13a93', name: "Couldn't Close Follow Up",     color: '#ec4899', group: 'followup' },
  { id: 'f7feea88-3038-4d3c-a2c4-2d4e9031710d', name: 'Closed',                       color: '#16a34a', group: 'won' },
  { id: 'd945bc35-3c60-4110-a5cf-bdcea43c4b5c', name: 'Deposit',                      color: '#0d9488', group: 'won' },
  { id: 'fef00e33-ba10-44c8-8624-2c24d6812eaf', name: 'Unqualified',                  color: '#dc2626', group: 'lost' },
  { id: 'a2b0f286-14f3-40ae-8b8b-f564b4464750', name: 'Lost',                         color: '#ef4444', group: 'lost' },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));

// Groups for funnel calculation
const GROUP_LABELS: Record<string, string> = {
  lead: 'New Leads',
  booked: 'Calls Booked',
  noshow: 'No-showed',
  followup: 'Follow Up',
  won: 'Closed / Won',
  lost: 'Lost / Unqualified',
};

interface Opp {
  id: string;
  name: string;
  monetaryValue: number;
  status: string;
  stageId: string;
  assignedTo: string;
  contact: { name: string; email: string; phone: string };
  createdAt: string;
  updatedAt: string;
  source?: string;
}

function fmt$(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function pct(num: number, den: number) {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="card px-4 py-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="font-bold text-xl leading-tight" style={{ color }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Funnel View ───────────────────────────────────────────────────────────────
function FunnelView({ opps, adSpend }: { opps: Opp[]; adSpend: number }) {
  const total = opps.length;

  const byGroup = STAGES.reduce((acc, s) => {
    const group = s.group;
    if (!acc[group]) acc[group] = 0;
    acc[group] += opps.filter(o => o.stageId === s.id).length;
    return acc;
  }, {} as Record<string, number>);

  const booked = (byGroup.booked || 0) + (byGroup.noshow || 0) + (byGroup.followup || 0) + (byGroup.won || 0) + (byGroup.lost || 0);
  const showed = booked - (byGroup.noshow || 0);
  const won = byGroup.won || 0;
  const wonValue = opps.filter(o => STAGE_MAP[o.stageId]?.group === 'won').reduce((s, o) => s + (o.monetaryValue || 0), 0);
  const cpa = won > 0 && adSpend > 0 ? adSpend / won : 0;

  const steps = [
    { label: 'Total Leads',     count: total,  pctOf: null,   color: '#6c63ff' },
    { label: 'Calls Booked',    count: booked, pctOf: total,  color: '#8b5cf6' },
    { label: 'Showed Up',       count: showed, pctOf: booked, color: '#0891b2' },
    { label: 'Closed / Won',    count: won,    pctOf: showed,  color: '#16a34a' },
  ];

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Leads"    value={String(total)}                   color="#6c63ff" icon={<Users size={16} />} />
        <StatCard label="Calls Booked"   value={String(booked)}  sub={`${pct(booked, total)} book rate`}  color="#8b5cf6" icon={<Calendar size={16} />} />
        <StatCard label="Show Rate"      value={pct(showed, booked)}             color="#0891b2" icon={<PhoneCall size={16} />} sub={`${showed} showed`} />
        <StatCard label="Close Rate"     value={pct(won, showed)}                color="#16a34a" icon={<Check size={16} />}    sub={`${won} closed`} />
        <StatCard label="Revenue Won"    value={fmt$(wonValue)}                  color="#0d9488" icon={<DollarSign size={16} />} />
        <StatCard label="Cost / Acq."    value={cpa > 0 ? fmt$(cpa) : '—'}      color="#f59e0b" icon={<Target size={16} />}  sub={adSpend > 0 ? `${fmt$(adSpend)} ad spend` : 'Set ad spend'} />
      </div>

      {/* Funnel */}
      <div className="card p-6">
        <h3 className="font-semibold mb-6">Sales Funnel</h3>
        <div className="space-y-3 max-w-2xl">
          {steps.map((step, i) => {
            const maxW = total > 0 ? (step.count / total) * 100 : 0;
            return (
              <div key={step.label}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="font-medium">{step.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold" style={{ color: step.color }}>{step.count}</span>
                    {step.pctOf !== null && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${step.color}18`, color: step.color }}>
                        {pct(step.count, step.pctOf!)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-8 rounded-lg overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="h-full rounded-lg transition-all duration-700"
                    style={{ width: `${maxW}%`, background: step.color, opacity: 0.8 }} />
                </div>
                {i < steps.length - 1 && (
                  <div className="flex justify-center mt-1">
                    <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage breakdown */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <p className="font-semibold text-sm">Stage Breakdown</p>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {STAGES.map(stage => {
            const count = opps.filter(o => o.stageId === stage.id).length;
            const val = opps.filter(o => o.stageId === stage.id).reduce((s, o) => s + (o.monetaryValue || 0), 0);
            return (
              <div key={stage.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
                  <span className="text-sm font-medium">{stage.name}</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {val > 0 && <span style={{ color: 'var(--text-muted)' }}>{fmt$(val)}</span>}
                  <span className="font-bold w-8 text-right" style={{ color: count > 0 ? stage.color : 'var(--text-muted)' }}>
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────
function KanbanView({ opps }: { opps: Opp[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 600 }}>
      {STAGES.map(stage => {
        const stageOpps = opps.filter(o => o.stageId === stage.id);
        const stageVal = stageOpps.reduce((s, o) => s + (o.monetaryValue || 0), 0);
        return (
          <div key={stage.id} className="shrink-0 flex flex-col rounded-xl"
            style={{ width: 240, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                  <span className="font-semibold text-xs truncate">{stage.name}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-1"
                  style={{ background: `${stage.color}22`, color: stage.color }}>{stageOpps.length}</span>
              </div>
              {stageVal > 0 && (
                <p className="text-xs mt-0.5 pl-4" style={{ color: 'var(--text-muted)' }}>{fmt$(stageVal)}</p>
              )}
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {stageOpps.length === 0 && (
                <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>Empty</div>
              )}
              {stageOpps.map(opp => (
                <div key={opp.id}
                  className="card p-3 space-y-1.5 cursor-pointer hover:border-[var(--accent)] transition-colors text-sm"
                  onClick={() => setExpanded(expanded === opp.id ? null : opp.id)}>
                  <p className="font-semibold leading-tight">{opp.contact?.name || opp.name}</p>
                  {opp.monetaryValue > 0 && (
                    <p className="font-bold text-xs" style={{ color: '#16a34a' }}>{fmt$(opp.monetaryValue)}</p>
                  )}
                  {expanded === opp.id && (
                    <div className="pt-1.5 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                      {opp.contact?.email && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opp.contact.email}</p>}
                      {opp.contact?.phone && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opp.contact.phone}</p>}
                      {opp.source && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Source: {opp.source}</p>}
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Added {new Date(opp.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Table View ────────────────────────────────────────────────────────────────
function TableView({ opps }: { opps: Opp[] }) {
  const [sort, setSort] = useState<'date' | 'value' | 'stage'>('date');

  const sorted = [...opps].sort((a, b) => {
    if (sort === 'value') return (b.monetaryValue || 0) - (a.monetaryValue || 0);
    if (sort === 'stage') {
      const ai = STAGES.findIndex(s => s.id === a.stageId);
      const bi = STAGES.findIndex(s => s.id === b.stageId);
      return ai - bi;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <p className="font-semibold text-sm">{opps.length} Opportunities</p>
        <div className="flex gap-1">
          {(['date', 'value', 'stage'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className="text-xs px-2.5 py-1 rounded-md transition-all capitalize"
              style={{ background: sort === s ? 'var(--accent)' : 'var(--surface)', color: sort === s ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {['Contact', 'Stage', 'Value', 'Source', 'Date Added'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((opp, i) => {
              const stage = STAGE_MAP[opp.stageId];
              return (
                <tr key={opp.id}
                  className="hover:bg-[var(--surface-2)] transition-colors"
                  style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{opp.contact?.name || opp.name}</p>
                    {opp.contact?.email && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opp.contact.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {stage ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${stage.color}18`, color: stage.color }}>
                        {stage.name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: opp.monetaryValue > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                    {opp.monetaryValue > 0 ? fmt$(opp.monetaryValue) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{opp.source || '—'}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    {new Date(opp.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No opportunities in pipeline yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [opps, setOpps] = useState<Opp[]>([]);
  const [adSpend, setAdSpend] = useState(0);
  const [adSpendInput, setAdSpendInput] = useState('');
  const [editingAdSpend, setEditingAdSpend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'funnel' | 'kanban' | 'table'>('funnel');

  useEffect(() => {
    const user = session?.user as any;
    if (status === 'unauthenticated' || (session && user?.role !== 'admin')) router.push('/login');
  }, [status, session, router]);

  const loadData = useCallback(async () => {
    if (status !== 'authenticated') return;
    setSyncing(true);
    const res = await fetch('/api/admin/sales-pipeline');
    if (res.ok) {
      const data = await res.json();
      setOpps(data.opportunities ?? []);
      setAdSpend(data.adSpend ?? 0);
      setAdSpendInput(String(data.adSpend ?? ''));
    }
    setLoading(false);
    setSyncing(false);
  }, [status]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveAdSpend() {
    const val = parseFloat(adSpendInput) || 0;
    await fetch('/api/admin/sales-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adSpend: val }),
    });
    setAdSpend(val);
    setEditingAdSpend(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading sales pipeline…</p>
    </div>
  );

  const wonOpps = opps.filter(o => STAGE_MAP[o.stageId]?.group === 'won');
  const totalRevenue = wonOpps.reduce((s, o) => s + (o.monetaryValue || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/admin" className="text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>Admin</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2">
            <TrendingUp size={15} style={{ color: 'var(--accent)' }} /> Sales Tracker
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(108,99,255,0.1)', color: 'var(--accent)' }}>
            Merova AV Pipeline
          </span>
          {totalRevenue > 0 && (
            <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>{fmt$(totalRevenue)} won</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Ad Spend */}
          <div className="flex items-center gap-1">
            {editingAdSpend ? (
              <>
                <input
                  type="number"
                  value={adSpendInput}
                  onChange={e => setAdSpendInput(e.target.value)}
                  placeholder="Ad spend $"
                  className="w-28 text-xs px-2 py-1.5 rounded-lg border"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  onKeyDown={e => e.key === 'Enter' && saveAdSpend()}
                  autoFocus
                />
                <button onClick={saveAdSpend} className="text-xs px-2 py-1.5 rounded-lg" style={{ background: 'var(--accent)', color: '#fff' }}>Save</button>
                <button onClick={() => setEditingAdSpend(false)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)' }}><X size={12} /></button>
              </>
            ) : (
              <button onClick={() => setEditingAdSpend(true)}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 border transition-colors hover:border-[var(--accent)]"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                <DollarSign size={11} />
                {adSpend > 0 ? `Ad Spend: ${fmt$(adSpend)}` : 'Set Ad Spend'}
              </button>
            )}
          </div>

          {/* View switcher */}
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {([
              { key: 'funnel', label: 'Funnel',  icon: <BarChart2 size={13} /> },
              { key: 'kanban', label: 'Kanban',  icon: <Kanban size={13} /> },
              { key: 'table',  label: 'Table',   icon: <Table2 size={13} /> },
            ] as const).map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all"
                style={{ background: view === v.key ? 'var(--accent)' : 'transparent', color: view === v.key ? '#fff' : 'var(--text-muted)' }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          <button onClick={loadData} disabled={syncing} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            Sync GHL
          </button>
        </div>
      </nav>

      <div className="px-6 py-6">
        {view === 'funnel' && <FunnelView opps={opps} adSpend={adSpend} />}
        {view === 'kanban' && <KanbanView opps={opps} />}
        {view === 'table'  && <TableView  opps={opps} />}
      </div>
    </div>
  );
}

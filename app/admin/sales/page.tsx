'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart2, TrendingUp, Phone, PhoneCall, DollarSign,
  RefreshCw, X, ChevronDown, Check, Users, Target,
  Calendar, AlertTriangle, Kanban, Table2, CalendarDays,
  Zap, Eye, MousePointerClick, Activity,
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

interface Disposition { showed: 0 | 1 | null; qualified: 0 | 1 | null }

// Single source of truth for "did this lead show / qualify" — used by every
// view (Funnel, Weekly, Kanban, Table) so numbers never disagree across tabs.
// Real per-lead dispositions win; only fall back to the GHL stage for leads
// that haven't been dispositioned yet.
function isBookedOpp(o: Opp) {
  return STAGE_MAP[o.stageId]?.group !== 'lead';
}
function oppShowed(o: Opp, dispositions: Record<string, Disposition>): boolean {
  const d = dispositions[o.id];
  if (d?.showed === 1) return true;
  if (d?.showed === 0) return false;
  return STAGE_MAP[o.stageId]?.group !== 'noshow';
}
function oppQualified(o: Opp, dispositions: Record<string, Disposition>): boolean {
  return dispositions[o.id]?.qualified === 1;
}
function oppClosed(o: Opp): boolean {
  return STAGE_MAP[o.stageId]?.group === 'won';
}

function fmt$(n: number) {
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
function FunnelView({ opps, adSpend, adSpendSource, roiData }: {
  opps: Opp[]; adSpend: number; adSpendSource: 'meta' | 'manual';
}) {
  const total = opps.length;

  // Pure stage-based counts — ground truth is which GHL stage an opp currently sits in.
  const countByStage = (name: string) => opps.filter(o => STAGE_MAP[o.stageId]?.name === name).length;
  const closedCount    = countByStage('Closed');
  const depositCount   = countByStage('Deposit');
  const rescheduled    = countByStage('Rescheduled');
  const noShowCount    = countByStage('No-showed');
  const unqualified    = countByStage('Unqualified');
  const lostCount      = countByStage('Lost');
  const couldntClose   = countByStage("Couldn't Close Follow Up");
  const strategyBooked = countByStage('Strategy Call Booked');

  const won = closedCount + depositCount;
  const wonValue = opps.filter(oppClosed).reduce((s, o) => s + (o.monetaryValue || 0), 0);

  // Shown = calls that actually happened: closed, deposit, couldn't-close-followup, or lost after the call.
  const shown = closedCount + depositCount + couldntClose + lostCount;
  // Booked = everyone who ever booked a call, minus pure pre-call leads and "Follow Up Required";
  // Unqualified only counts half since some of those never actually booked.
  const booked = strategyBooked + depositCount + rescheduled + noShowCount + closedCount + lostCount + couldntClose + (0.5 * unqualified);

  const showRate = booked > 0 ? (shown / booked) * 100 : 0;
  const noShowRate = booked > 0 ? ((noShowCount + rescheduled) / booked) * 100 : 0;
  const closeRate = shown > 0 ? (won / shown) * 100 : 0;

  // Real cost math, only meaningful once real ad spend is wired in (Meta or manual)
  const cac  = won > 0    && adSpend > 0 ? adSpend / won    : 0; // Customer Acquisition Cost
  const cpbc = booked > 0 && adSpend > 0 ? adSpend / booked : 0; // Cost Per Booked Call

  const ltvToCac = roiData && !roiData.hidden && roiData.totalLTV != null && adSpend > 0 ? roiData.totalLTV / adSpend : null;
  const profit = roiData && !roiData.hidden && roiData.totalLTV != null ? roiData.totalLTV - adSpend : null;

  const steps = [
    { label: 'Total Leads',     count: total,   pctOf: null,   color: '#6c63ff' },
    { label: 'Calls Booked',    count: booked,  pctOf: total,  color: '#8b5cf6' },
    { label: 'Showed Up',       count: shown,   pctOf: booked, color: '#0891b2' },
    { label: 'Closed / Won',    count: won,     pctOf: shown,  color: '#16a34a' },
  ];

  return (
    <div className="space-y-6">
      {/* Data source note */}
      <div className="card p-3 text-xs flex items-start gap-2" style={{ color: 'var(--text-muted)' }}>
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          Every count below comes straight from the GHL pipeline stages — Booked/Shown/No-Show/Closed are all derived from which stage each opp currently sits in, no manual dispositioning needed.{' '}
          Cost figures use {adSpendSource === 'meta' ? <strong style={{ color: 'var(--green)' }}>live Meta spend</strong> : <strong style={{ color: 'var(--yellow)' }}>your manual ad spend entry</strong>} — connect Meta in Ad Health for exact numbers.
        </span>
      </div>

      {/* Pipeline volume & rates */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Pipeline</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Leads"    value={String(total)}                   color="#6c63ff" icon={<Users size={16} />} />
          <StatCard label="Calls Booked"   value={String(Math.round(booked))}  sub={`${pct(booked, total)} book rate`}  color="#8b5cf6" icon={<Calendar size={16} />} />
          <StatCard label="Showed Up"      value={String(shown)} sub={`${Math.round(showRate)}% show rate`} color="#0891b2" icon={<PhoneCall size={16} />} />
          <StatCard label="No-Show"        value={`${Math.round(noShowRate)}%`} sub="no-show + reschedule / booked" color="#e11d48" icon={<X size={16} />} />
          <StatCard label="Closed / Won"   value={String(won)} sub={`${Math.round(closeRate)}% close rate`} color="#16a34a" icon={<Check size={16} />} />
        </div>
      </div>

      {/* Cost & ROI */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Cost &amp; ROI</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Ad Spend"          value={fmt$(adSpend)}                  color="#f59e0b" icon={<DollarSign size={16} />} sub={adSpendSource === 'meta' ? 'live from Meta' : 'manual entry'} />
          <StatCard label="Cost / Call"        value={cpbc > 0 ? fmt$(cpbc) : '—'}   color="#0891b2" icon={<PhoneCall size={16} />}  sub={`per booked call`} />
          <StatCard label="CAC"                value={cac > 0 ? fmt$(cac) : '—'}     color="#ef4444" icon={<Target size={16} />}     sub={`per closed deal`} />
          <StatCard label="Revenue Won"        value={fmt$(wonValue)}                 color="#0d9488" icon={<DollarSign size={16} />} />
          {roiData?.hidden ? (
            <StatCard label="LTV : CAC" value="🔒 Hidden" color="var(--text-muted)" icon={<TrendingUp size={16} />} />
          ) : ltvToCac != null ? (
            <StatCard label="LTV : CAC" value={`${ltvToCac.toFixed(1)}x`} color={ltvToCac >= 3 ? 'var(--green)' : ltvToCac >= 1 ? 'var(--yellow)' : 'var(--red)'} icon={<TrendingUp size={16} />} sub="client value vs. ad spend" />
          ) : (
            <StatCard label="LTV : CAC" value="—" color="var(--text-muted)" icon={<TrendingUp size={16} />} sub="needs ad spend" />
          )}
        </div>
      </div>

      {/* Client ROI — ties ad spend to what acquired clients are actually worth */}
      {roiData && (
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-1">Client ROI</h3>
          {roiData.hidden ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>🔒 Only Jesse can view this — it's derived from client retainer amounts.</p>
          ) : (
            <>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                What every dollar of ad spend has bought so far, based on current MRR × months each client has been with us.
              </p>
                <StatCard label="Active Clients" value={String(roiData.activeClients ?? 0)} color="#6c63ff" icon={<Users size={16} />} />
                <StatCard label="Total MRR"      value={fmt$(roiData.totalMRR ?? 0)}        color="var(--green)" icon={<DollarSign size={16} />} />
                <StatCard label="Total LTV So Far" value={fmt$(roiData.totalLTV ?? 0)}      color="var(--accent)" icon={<TrendingUp size={16} />} sub="revenue collected to date" />
                <StatCard label="Profit vs. Ad Spend" value={profit != null ? fmt$(profit) : '—'} color={profit != null && profit >= 0 ? 'var(--green)' : 'var(--red)'} icon={<DollarSign size={16} />} />
              </div>
            </>
          )}
        </div>
      )}

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
                    <span className="font-bold" style={{ color: step.color }}>{Math.round(step.count)}</span>
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
function KanbanView({ opps, dispositions }: { opps: Opp[]; dispositions: Record<string, Disposition> }) {
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
                  {isBookedOpp(opp) && (() => {
                    const disp = dispositions[opp.id];
                    const showedVal = disp?.showed ?? null;
                    return (
                      <div className="flex gap-1 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{
                          background: showedVal === 1 ? 'rgba(34,197,94,0.15)' : showedVal === 0 ? 'rgba(239,68,68,0.15)' : 'var(--surface-2)',
                          color: showedVal === 1 ? 'var(--green)' : showedVal === 0 ? 'var(--red)' : 'var(--text-muted)',
                        }}>{showedVal === 1 ? 'Showed' : showedVal === 0 ? 'No Show' : 'Showed?'}</span>
                        {showedVal === 1 && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{
                            background: disp?.qualified === 1 ? 'rgba(245,158,11,0.15)' : 'var(--surface-2)',
                            color: disp?.qualified === 1 ? 'var(--yellow)' : 'var(--text-muted)',
                          }}>{disp?.qualified === 1 ? 'Qualified' : disp?.qualified === 0 ? 'Not Qualified' : 'Qualified?'}</span>
                        )}
                      </div>
                    );
                  })()}
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

// ── Disposition control ─────────────────────────────────────────────────────────
function DispositionPill({ value, onChange }: { value: 0 | 1 | null; onChange: (v: 0 | 1 | null) => void }) {
  return (
    <div className="flex gap-1">
      <button
        onClick={() => onChange(value === 1 ? null : 1)}
        className="text-xs px-2 py-0.5 rounded-md font-medium transition-colors"
        style={{ background: value === 1 ? 'var(--green)' : 'var(--surface-2)', color: value === 1 ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
      >Yes</button>
      <button
        onClick={() => onChange(value === 0 ? null : 0)}
        className="text-xs px-2 py-0.5 rounded-md font-medium transition-colors"
        style={{ background: value === 0 ? 'var(--red)' : 'var(--surface-2)', color: value === 0 ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
      >No</button>
    </div>
  );
}

// ── Table View ────────────────────────────────────────────────────────────────
function TableView({ opps, dispositions, onDisposition }: {
  opps: Opp[];
  dispositions: Record<string, Disposition>;
  onDisposition: (oppId: string, field: 'showed' | 'qualified', value: 0 | 1 | null) => void;
}) {
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
              {['Contact', 'Stage', 'Value', 'Source', 'Date Added', 'Showed Up?', 'Qualified?'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((opp, i) => {
              const stage = STAGE_MAP[opp.stageId];
              const isBooked = stage?.group !== 'lead';
              const disp = dispositions[opp.id] || { showed: null, qualified: null };
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
                  <td className="px-4 py-3">
                    {isBooked ? (
                      <DispositionPill value={disp.showed} onChange={v => onDisposition(opp.id, 'showed', v)} />
                    ) : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isBooked && disp.showed === 1 ? (
                      <DispositionPill value={disp.qualified} onChange={v => onDisposition(opp.id, 'qualified', v)} />
                    ) : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No opportunities in pipeline yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Weekly View ───────────────────────────────────────────────────────────────
interface WeeklyManual {
  week_start: string;
  ad_spend: number;
  cash_collected: number;
  total_ltv: number;
  qualified_calls: number;
  booked_ad: number;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

// Tracker originally anchored to Monday, July 6, 2026 — but if real leads
// started coming in before that, expand backward so no data is hidden.
const TRACKER_ANCHOR = new Date(2026, 6, 6);

function trackerStart(opps: Opp[]): Date {
  if (opps.length === 0) return TRACKER_ANCHOR;
  const earliest = opps.reduce((min, o) => {
    const d = new Date(o.createdAt);
    return d < min ? d : min;
  }, new Date(opps[0].createdAt));
  const earliestMonday = mondayOf(earliest);
  return earliestMonday < TRACKER_ANCHOR ? earliestMonday : TRACKER_ANCHOR;
}

function monthOptions(start: Date) {
  const opts: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    opts.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
  }
  return opts;
}

function weeksForMonth(year: number, month: number, start: Date): string[] {
  const weeks: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (d.getDay() === 1 && d >= start) weeks.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

function defaultMonth(start: Date) {
  // Default to the month containing the Monday of the CURRENT week (not
  // today's calendar month) so this week's data is visible without having
  // to manually switch months when the week spans a month boundary.
  const currentWeekMonday = mondayOf(new Date());
  const base = currentWeekMonday < start ? start : currentWeekMonday;
  return { year: base.getFullYear(), month: base.getMonth() };
}

function fmtWeek(weekStart: string) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function num$(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function pct1(num: number, den: number) {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(1)}%`;
}

function ratio(num: number, den: number) {
  if (!den) return '—';
  return `${(num / den).toFixed(2)}x`;
}

// Small inline-editable number cell
function EditableCell({ value, onSave, prefix }: { value: number; onSave: (v: number) => void; prefix?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value || ''));

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onSave(parseFloat(val) || 0); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-20 text-xs px-1.5 py-1 rounded border"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--accent)', color: 'var(--text)' }}
      />
    );
  }
  return (
    <button
      onClick={() => { setVal(String(value || '')); setEditing(true); }}
      className="text-sm font-semibold px-1.5 py-1 rounded hover:bg-[var(--surface-2)] transition-colors"
      style={{ color: 'var(--text)', border: '1px dashed transparent' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
    >
      {prefix}{value ? value.toLocaleString() : '0'}
    </button>
  );
}

function WeeklyView({ opps, dispositions }: { opps: Opp[]; dispositions: Record<string, Disposition> }) {
  const [manual, setManual] = useState<Record<string, WeeklyManual>>({});
  const [loaded, setLoaded] = useState(false);
  const start = trackerStart(opps);
  const [selectedMonth, setSelectedMonth] = useState(() => defaultMonth(start));
  const months = monthOptions(start);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/sales-weekly');
      if (res.ok) {
        const rows: WeeklyManual[] = await res.json();
        setManual(Object.fromEntries(rows.map(r => [r.week_start, r])));
      }
      setLoaded(true);
    })();
  }, []);

  const emptyManual = (weekStart: string): WeeklyManual =>
    ({ week_start: weekStart, ad_spend: 0, cash_collected: 0, total_ltv: 0, qualified_calls: 0, booked_ad: 0 });

  async function saveField(weekStart: string, field: keyof Omit<WeeklyManual, 'week_start'>, value: number) {
    const current = manual[weekStart] || emptyManual(weekStart);
    const updated = { ...current, [field]: value };
    setManual(prev => ({ ...prev, [weekStart]: updated }));
    const res = await fetch('/api/admin/sales-weekly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const saved = await res.json();
      setManual(prev => ({ ...prev, [weekStart]: saved }));
    }
  }

  const weeks = weeksForMonth(selectedMonth.year, selectedMonth.month, start);

  async function syncMetaSpend() {
    if (weeks.length === 0) return;
    setSyncingMeta(true);
    setSyncMsg('');
    const res = await fetch(`/api/admin/sales-meta-ads/weekly?weeks=${weeks.join(',')}`);
    const data = await res.json();
    if (!res.ok) {
      setSyncMsg(data.error || 'Meta sync failed — connect your ad account in Ad Health first.');
      setSyncingMeta(false);
      return;
    }
    for (const w of data.weeks as { weekStart: string; spend: number }[]) {
      await saveField(w.weekStart, 'ad_spend', w.spend);
    }
    setSyncMsg(`Synced ad spend for ${data.weeks.length} week(s) from Meta.`);
    setSyncingMeta(false);
  }

  const rows = weeks.map(weekStart => {
    const weekStartDate = new Date(weekStart + 'T00:00:00');
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    const weekOpps = opps.filter(o => {
      const created = new Date(o.createdAt);
      return created >= weekStartDate && created < weekEndDate;
    });

    const leads = weekOpps.length;
    const bookedOpps = weekOpps.filter(isBookedOpp);
    const totalBooked = bookedOpps.length;
    const closes = weekOpps.filter(oppClosed).length;

    // Same helpers as Funnel/Table views — one source of truth for showed/qualified.
    const showed = bookedOpps.filter(o => oppShowed(o, dispositions)).length;
    const qualified = bookedOpps.filter(o => oppQualified(o, dispositions)).length;

    const m = manual[weekStart] || emptyManual(weekStart);
    const { ad_spend: adSpend, cash_collected: cashCollected, total_ltv: totalLtv, booked_ad: bookedAdRaw } = m;
    // Ad/Set split is manually adjusted; Set is whatever's left of Total Booked.
    const bookedFromAd = Math.min(bookedAdRaw || 0, totalBooked);
    const bookedFromSet = totalBooked - bookedFromAd;

    const bookingPct = leads > 0 ? (totalBooked / leads) * 100 : 0;
    const showPct = totalBooked > 0 ? (showed / totalBooked) * 100 : 0;
    const qualPct = showed > 0 ? (qualified / showed) * 100 : 0;
    const closePctQC = qualified > 0 ? (closes / qualified) * 100 : 0;

    const profit = cashCollected - adSpend;
    const frontEndROI = adSpend > 0 ? (profit / adSpend) * 100 : 0;
    const ltvToCac = adSpend > 0 ? totalLtv / adSpend : 0;
    const cpa = closes > 0 ? adSpend / closes : 0;
    const cpbc = totalBooked > 0 ? adSpend / totalBooked : 0;
    const cpsc = showed > 0 ? adSpend / showed : 0;
    const cpqsc = qualified > 0 ? adSpend / qualified : 0;

    return {
      weekStart, leads, bookedFromAd, bookedFromSet, totalBooked, bookingPct,
      showed, showPct, qualified, qualPct, closes, closePctQC,
      adSpend, cashCollected, totalLtv, profit, frontEndROI, ltvToCac,
      cpa, cpbc, cpsc, cpqsc,
    };
  });

  if (!loaded) {
    return <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading weekly data…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} style={{ color: 'var(--accent)' }} />
          <select
            className="input w-52 text-sm"
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number);
              setSelectedMonth({ year: y, month: m });
            }}
          >
            {months.map(o => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={syncMetaSpend}
            disabled={syncingMeta || weeks.length === 0}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={syncingMeta ? 'animate-spin' : ''} />
            {syncingMeta ? 'Syncing…' : 'Sync Ad Spend from Meta'}
          </button>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tracking starts {fmtWeek(isoDate(start))}</p>
        </div>
      </div>

      {syncMsg && (
        <div className="card p-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>{syncMsg}</div>
      )}

      <div className="card p-3 text-xs flex items-start gap-2" style={{ color: 'var(--text-muted)' }}>
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          <strong style={{ color: 'var(--text)' }}>Leads Gen., Total Booked &amp; Closes</strong> sync automatically from the Merova AV Pipeline.{' '}
          <strong style={{ color: 'var(--text)' }}>Showed &amp; Qualified</strong> are pulled from the disposition you set per-lead in the Table view.{' '}
          <strong style={{ color: 'var(--text)' }}>Booked (Ad)</strong> is a manual split of Total Booked — Booked (Set) is whatever's left over.{' '}
          <strong style={{ color: 'var(--text)' }}>Ad Spend, Cash Collected &amp; Total LTV</strong> are entered manually, or synced from Meta via the button above. All bucketed by the week the lead came in.
        </span>
      </div>

      {weeks.length === 0 ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          No weeks in this month.
        </div>
      ) : (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ minWidth: 1900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {[
                  'Week', 'Leads Gen.', 'Booked (Ad)*', 'Booked (Set)', 'Total Booked', 'Booking %',
                  'Calls Showed', 'Show %', 'Qualified Calls', 'Qual %',
                  'Ad Spend*', 'Cash Collected*', 'Front End ROI', 'Profit',
                  'Total LTV*', 'LTV:CAC', 'Closes', 'CPA', 'CPBC', 'CPSC', 'CPQSC', 'Close % QC',
                ].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.weekStart} className="hover:bg-[var(--surface-2)] transition-colors"
                  style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{fmtWeek(r.weekStart)}</td>
                  <td className="px-3 py-2.5">{r.leads}</td>
                  <td className="px-3 py-2.5">
                    <EditableCell value={r.bookedFromAd} onSave={v => saveField(r.weekStart, 'booked_ad', Math.min(v, r.totalBooked))} />
                  </td>
                  <td className="px-3 py-2.5">{r.bookedFromSet}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.totalBooked}</td>
                  <td className="px-3 py-2.5">{pct1(r.totalBooked, r.leads)}</td>
                  <td className="px-3 py-2.5">{r.showed}</td>
                  <td className="px-3 py-2.5">{pct1(r.showed, r.totalBooked)}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.qualified}</td>
                  <td className="px-3 py-2.5">{pct1(r.qualified, r.showed)}</td>
                  <td className="px-3 py-2.5">
                    <EditableCell value={r.adSpend} onSave={v => saveField(r.weekStart, 'ad_spend', v)} prefix="$" />
                  </td>
                  <td className="px-3 py-2.5">
                    <EditableCell value={r.cashCollected} onSave={v => saveField(r.weekStart, 'cash_collected', v)} prefix="$" />
                  </td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: r.frontEndROI >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {r.adSpend > 0 ? `${r.frontEndROI >= 0 ? '+' : ''}${r.frontEndROI.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: r.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {num$(r.profit)}
                  </td>
                  <td className="px-3 py-2.5">
                    <EditableCell value={r.totalLtv} onSave={v => saveField(r.weekStart, 'total_ltv', v)} prefix="$" />
                  </td>
                  <td className="px-3 py-2.5">{ratio(r.totalLtv, r.adSpend)}</td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--green)' }}>{r.closes}</td>
                  <td className="px-3 py-2.5">{r.cpa > 0 ? num$(r.cpa) : '—'}</td>
                  <td className="px-3 py-2.5">{r.cpbc > 0 ? num$(r.cpbc) : '—'}</td>
                  <td className="px-3 py-2.5">{r.cpsc > 0 ? num$(r.cpsc) : '—'}</td>
                  <td className="px-3 py-2.5">{r.cpqsc > 0 ? num$(r.cpqsc) : '—'}</td>
                  <td className="px-3 py-2.5">{pct1(r.closes, r.qualified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
      <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>* Manually entered</p>
    </div>
  );
}

// ── Ad Health View ──────────────────────────────────────────────────────────────
interface MetaStatsBlock { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; reach: number; frequency: number }

function AdHealthView({ closedDeals }: { closedDeals: number }) {
  const [connected, setConnected] = useState(false);
  const [adAccountId, setAdAccountId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [acctInput, setAcctInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ last7d?: MetaStatsBlock; thisMonth?: MetaStatsBlock; lifetime?: MetaStatsBlock; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/sales-meta-ads');
    const data = await res.json();
    setConnected(data.connected);
    setAdAccountId(data.adAccountId || '');
    setAcctInput(data.adAccountId || '');
    setStats(data.connected ? data : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    await fetch('/api/admin/sales-meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: tokenInput, ad_account_id: acctInput }),
    });
    setTokenInput('');
    setEditing(false);
    setSaving(false);
    await load();
  }

  if (loading) {
    return <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading ad health…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold flex items-center gap-2"><Zap size={16} style={{ color: 'var(--accent)' }} /> Meta Ad Account</h2>
          {connected && !editing && (
            <button onClick={() => setEditing(true)} className="btn-ghost text-xs">Edit connection</button>
          )}
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Connect your Meta Ads account to pull live spend, impressions, clicks &amp; CTR — and sync accurate weekly ad spend into the Weekly tracker.
        </p>

        {(!connected || editing) ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Ad Account ID (e.g. act_1234567890 or just the number)</label>
              <input className="input" value={acctInput} onChange={e => setAcctInput(e.target.value)} placeholder="act_1234567890" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Access Token</label>
              <input className="input" type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                placeholder={connected ? 'Enter new token to replace current one' : 'Paste your Meta access token…'} />
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving || !acctInput} className="btn-primary text-sm">
                {saving ? 'Saving…' : 'Save & Connect'}
              </button>
              {editing && (
                <button onClick={() => { setEditing(false); setTokenInput(''); }} className="btn-ghost text-sm">Cancel</button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--green)' }}>
            <Check size={12} /> Connected — {adAccountId}
          </p>
        )}
      </div>

      {connected && stats?.error && (
        <div className="card p-4 text-sm" style={{ color: 'var(--red)' }}>
          Couldn't fetch Meta stats: {stats.error}
        </div>
      )}

      {connected && !stats?.error && stats && (
        <>
          {([
            { label: 'Last 7 Days', block: stats.last7d, showCac: false },
            { label: 'This Month', block: stats.thisMonth, showCac: false },
            { label: 'Lifetime', block: stats.lifetime, showCac: true },
          ] as const).map(({ label, block, showCac }) => block && (
            <div key={label} className="card p-5">
              <h3 className="font-semibold text-sm mb-3">{label}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <StatCard label="Spend"       value={fmt$(block.spend)}                    color="#f59e0b" icon={<DollarSign size={16} />} />
                <StatCard label="Impressions" value={block.impressions.toLocaleString()}    color="#6c63ff" icon={<Eye size={16} />} />
                <StatCard label="Clicks"      value={block.clicks.toLocaleString()}         color="#0891b2" icon={<MousePointerClick size={16} />} />
                <StatCard label="CTR"         value={`${block.ctr.toFixed(2)}%`}            color="#16a34a" icon={<Activity size={16} />} />
                <StatCard label="CPC"         value={`$${block.cpc.toFixed(2)}`}            color="#dc7a3e" icon={<Target size={16} />} />
                <StatCard label="Reach"       value={block.reach.toLocaleString()}          color="#8b5cf6" icon={<Users size={16} />} />
                {showCac && (
                  <StatCard label="CAC" value={closedDeals > 0 ? fmt$(block.spend / closedDeals) : '—'} color="#ef4444" icon={<Target size={16} />} sub={`${closedDeals} closed`} />
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
interface RoiData { hidden: boolean; activeClients?: number; totalClients?: number; totalMRR?: number; totalLTV?: number }

export default function SalesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [opps, setOpps] = useState<Opp[]>([]);
  const [manualAdSpend, setManualAdSpend] = useState(0);
  const [adSpendInput, setAdSpendInput] = useState('');
  const [editingAdSpend, setEditingAdSpend] = useState(false);
  const [metaLifetimeSpend, setMetaLifetimeSpend] = useState<number | null>(null);
  const [roiData, setRoiData] = useState<RoiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<'funnel' | 'kanban' | 'table' | 'weekly' | 'adhealth'>('funnel');
  const [dispositions, setDispositions] = useState<Record<string, Disposition>>({});

  // True CAC needs true spend: live Meta lifetime spend wins when connected,
  // manual entry is only the fallback for accounts not yet hooked up.
  const adSpend = metaLifetimeSpend != null && metaLifetimeSpend > 0 ? metaLifetimeSpend : manualAdSpend;
  const adSpendSource: 'meta' | 'manual' = metaLifetimeSpend != null && metaLifetimeSpend > 0 ? 'meta' : 'manual';

  useEffect(() => {
    const user = session?.user as any;
    if (status === 'unauthenticated' || (session && user?.role !== 'admin')) router.push('/login');
  }, [status, session, router]);

  const loadData = useCallback(async () => {
    if (status !== 'authenticated') return;
    setSyncing(true);
    const [pipelineRes, dispRes, metaRes, roiRes] = await Promise.all([
      fetch('/api/admin/sales-pipeline'),
      fetch('/api/admin/lead-dispositions'),
      fetch('/api/admin/sales-meta-ads'),
      fetch('/api/admin/sales-roi'),
    ]);
    if (pipelineRes.ok) {
      const data = await pipelineRes.json();
      setOpps(data.opportunities ?? []);
      setManualAdSpend(data.adSpend ?? 0);
      setAdSpendInput(String(data.adSpend ?? ''));
    }
    if (dispRes.ok) {
      const rows: { opp_id: string; showed: 0 | 1 | null; qualified: 0 | 1 | null }[] = await dispRes.json();
      setDispositions(Object.fromEntries(rows.map(r => [r.opp_id, { showed: r.showed, qualified: r.qualified }])));
    }
    if (metaRes.ok) {
      const data = await metaRes.json();
      setMetaLifetimeSpend(data.connected && !data.error ? (data.lifetime?.spend ?? 0) : null);
    }
    if (roiRes.ok) {
      setRoiData(await roiRes.json());
    }
    setLoading(false);
    setSyncing(false);
  }, [status]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDisposition(oppId: string, field: 'showed' | 'qualified', value: 0 | 1 | null) {
    const current = dispositions[oppId] || { showed: null, qualified: null };
    const updated = { ...current, [field]: value };
    // Un-showing a lead clears its qualified status too
    if (field === 'showed' && value !== 1) updated.qualified = null;
    setDispositions(prev => ({ ...prev, [oppId]: updated }));
    const res = await fetch('/api/admin/lead-dispositions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opp_id: oppId, ...updated }),
    });
    if (res.ok) {
      const saved = await res.json();
      setDispositions(prev => ({ ...prev, [oppId]: { showed: saved.showed, qualified: saved.qualified } }));
    }
  }

  async function saveAdSpend() {
    const val = parseFloat(adSpendInput) || 0;
    await fetch('/api/admin/sales-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adSpend: val }),
    });
    setManualAdSpend(val);
    setEditingAdSpend(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading sales pipeline…</p>
    </div>
  );

  const wonOpps = opps.filter(oppClosed);
  const totalRevenue = wonOpps.reduce((s, o) => s + (o.monetaryValue || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/admin/home" className="text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>Home</Link>
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
          {/* Ad Spend — live Meta wins, manual is only a fallback for CAC */}
          <div className="flex items-center gap-1">
            {adSpendSource === 'meta' ? (
              <span className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 border" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
                <Zap size={11} /> {fmt$(adSpend)} live from Meta
              </span>
            ) : editingAdSpend ? (
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
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }} title="Connect Meta in Ad Health for live, accurate spend">
                <DollarSign size={11} />
                {adSpend > 0 ? `Ad Spend (manual): ${fmt$(adSpend)}` : 'Set Ad Spend (manual)'}
              </button>
            )}
          </div>

          {/* View switcher */}
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {([
              { key: 'funnel',   label: 'Funnel',    icon: <BarChart2 size={13} /> },
              { key: 'weekly',   label: 'Weekly',    icon: <CalendarDays size={13} /> },
              { key: 'adhealth', label: 'Ad Health', icon: <Zap size={13} /> },
              { key: 'kanban',   label: 'Kanban',    icon: <Kanban size={13} /> },
              { key: 'table',    label: 'Table',     icon: <Table2 size={13} /> },
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
        {view === 'funnel'   && <FunnelView opps={opps} adSpend={adSpend} adSpendSource={adSpendSource} roiData={roiData} />}
        {view === 'weekly'   && <WeeklyView opps={opps} dispositions={dispositions} />}
        {view === 'adhealth' && <AdHealthView closedDeals={wonOpps.length} />}
        {view === 'kanban'   && <KanbanView opps={opps} dispositions={dispositions} />}
        {view === 'table'    && <TableView  opps={opps} dispositions={dispositions} onDisposition={handleDisposition} />}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Layers,
  Plus, Trash2, Users, Wallet, LayoutDashboard, ListChecks, ChevronDown, ChevronRight, Scale,
  Pencil, Check, X, RotateCcw, Zap, Target, Calendar,
} from 'lucide-react';

function fmt$(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}
function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

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

function Warnings({ warnings }: { warnings: { source: string; message: string }[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="card p-3 text-xs flex items-start gap-2" style={{ color: 'var(--yellow)', borderColor: 'var(--yellow)' }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, bold, muted, color, sub, emphasize, indent, bg }: {
  label: string; value: string; bold?: boolean; muted?: boolean; color?: string; sub?: string; emphasize?: boolean; indent?: number; bg?: string;
}) {
  return (
    <div
      className="px-4 py-2.5 flex items-center justify-between"
      style={{
        paddingLeft: indent ? 16 + indent * 16 : undefined,
        background: bg,
        ...(emphasize ? { borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 12 } : {}),
      }}
    >
      <div>
        <span className={bold ? 'font-semibold' : ''} style={{ color: muted ? 'var(--text-muted)' : undefined }}>{label}</span>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      <span className={bold ? 'font-bold' : ''} style={{ color: color ?? (muted ? 'var(--text-muted)' : undefined) }}>{value}</span>
    </div>
  );
}

// Small uppercase section header — REVENUE / COST OF GOODS SOLD / OPERATING
// EXPENSES — giving each MonthCard the section structure of an actual
// income statement instead of a flat stat list. A top rule separates it from
// the section above (skipped for the very first section in a card).
function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <p
      className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wider"
      style={{
        color: 'var(--text-muted)',
        paddingTop: first ? 12 : 20,
        borderTop: first ? undefined : '1px solid var(--border)',
        marginTop: first ? 0 : 4,
      }}
    >
      {children}
    </p>
  );
}

// Itemized Human Labor line — real employees pulled live from the Payroll
// Dashboard (pay_periods/payment_records), not a manually-maintained roster.
// Read-only here on purpose: editing an employee's rate or bonuses happens in
// Payroll itself so there's exactly one place that number can be changed.
function HumanLaborBreakdown({ items, total }: {
  items: { employeeId: number; name: string; role: string; amount: number }[]; total: number;
}) {
  return (
    <div>
      <div className="px-4 py-2.5 flex items-center justify-between">
        <div>
          <span className="font-semibold">Human Labor</span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            synced from <Link href="/admin/payroll" className="underline hover:opacity-80">Payroll Dashboard</Link>
          </p>
        </div>
        <span className="font-semibold">{fmt$(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-2.5 text-xs" style={{ color: 'var(--text-muted)', paddingLeft: 32 }}>No active employees.</p>
      ) : (
        items.map(i => (
          <div key={i.employeeId} className="px-4 py-1.5 flex items-center justify-between text-sm" style={{ paddingLeft: 32 }}>
            <span style={{ color: 'var(--text-muted)' }}>{i.name} <span className="text-xs">— {i.role}</span></span>
            <span style={{ color: 'var(--text-muted)' }}>{fmt$(i.amount)}</span>
          </div>
        ))
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: 'live' | 'manual' | 'unavailable' }) {
  if (source === 'live') return (
    <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--green)' }}>
      <Zap size={9} /> live
    </span>
  );
  if (source === 'manual') return (
    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--yellow)' }}>manual</span>
  );
  return (
    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--red)' }}>not connected</span>
  );
}

// Revenue/Ad Spend/Payroll/Total OpEx row — live or computed value by
// default, click the pencil to override a specific month; "revert" clears
// the override back to live/computed.
function EditableAmountRow({ label, amount, source, sub, onSave, onRevert, color, emphasize }: {
  label: string; amount: number; source: 'live' | 'manual' | 'unavailable'; sub?: string;
  onSave: (amount: number) => void; onRevert: () => void; color?: string; emphasize?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(amount));
  const emphasizeStyle = emphasize ? { borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 12 } : {};

  if (editing) {
    return (
      <div className="px-4 py-2.5 flex items-center justify-between gap-2" style={emphasizeStyle}>
        <span className="font-semibold">{label}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number" autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(Number(value)); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
            className="input text-sm w-28 text-right"
          />
          <button onClick={() => { onSave(Number(value)); setEditing(false); }} className="p-1.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}><Check size={12} /></button>
          <button onClick={() => setEditing(false)} className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }}><X size={12} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 flex items-center justify-between" style={emphasizeStyle}>
      <div>
        <span className="font-semibold">{label}</span>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <SourceBadge source={source} />
        {source === 'manual' && (
          <button onClick={onRevert} title="Revert to live/computed" className="opacity-50 hover:opacity-100"><RotateCcw size={12} /></button>
        )}
        <span className="font-bold" style={{ color }}>{fmt$(amount)}</span>
        <button onClick={() => { setValue(String(amount)); setEditing(true); }} className="opacity-50 hover:opacity-100"><Pencil size={12} /></button>
      </div>
    </div>
  );
}

// ── Overview: cumulative header + expandable month cards, grouped by year ──────
function OverviewView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/admin/income/summary').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (!data || data.error) return <p className="text-sm" style={{ color: 'var(--red)' }}>{data?.error || 'Failed to load'}</p>;

  const { months, ytd, clientLtvBreakdown, clientStageBreakdown, warnings } = data;

  // Group months by year — a flat list today, ready to fold into per-year
  // cards once there's more than one year of history.
  const byYear: Record<string, any[]> = {};
  for (const m of months) {
    const y = m.month.slice(0, 4);
    (byYear[y] ??= []).push(m);
  }
  const years = Object.keys(byYear).sort().reverse();

  return (
    <div className="space-y-6">
      <Warnings warnings={warnings} />

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Cumulative (All-Time, USD)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Revenue" value={fmt$(ytd.revenue)} color="#6c63ff" icon={<DollarSign size={16} />} />
          <StatCard label="Total Ad Spend" value={fmt$(ytd.adSpend)} color="#f59e0b" icon={<TrendingDown size={16} />} />
          <StatCard label="Cumulative Profit" value={fmt$(ytd.netProfit)} color={ytd.netProfit >= 0 ? 'var(--green)' : 'var(--red)'} icon={<Wallet size={16} />} />
          <StatCard label="Overall Margin" value={ytd.overallMarginPct != null ? pct(ytd.overallMarginPct) : '—'} color="#16a34a" icon={<Layers size={16} />} />
          <StatCard label="Profitability Ratio" value={ytd.profitabilityRatio != null ? `${ytd.profitabilityRatio.toFixed(2)}x` : '—'} color="#0d9488" icon={<Scale size={16} />} sub="revenue per $1 of total cost" />
          <StatCard label="Avg ROAS" value={ytd.avgRoas != null ? `${ytd.avgRoas.toFixed(2)}x` : '—'} color="#8b5cf6" icon={<TrendingUp size={16} />} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Client Health &amp; Growth</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Client LTV" value={fmt$(ytd.clientLtvTotal)} color="#e879f9" icon={<Users size={16} />} sub="retainer × confirmed months paid" />
          <StatCard label="LTV : CAC" value={ytd.ltvToCac != null ? `${ytd.ltvToCac.toFixed(1)}x` : '—'} color={ytd.ltvToCac == null ? 'var(--text-muted)' : ytd.ltvToCac >= 3 ? 'var(--green)' : ytd.ltvToCac >= 1 ? 'var(--yellow)' : 'var(--red)'} icon={<Target size={16} />} sub="client value per $1 of acquisition spend" />
          <StatCard label="Avg Client Tenure" value={ytd.avgClientTenureMonths != null ? `${ytd.avgClientTenureMonths.toFixed(1)} mo` : '—'} color="#0ea5e9" icon={<Calendar size={16} />} sub={ytd.avgClientTenureMonths != null ? 'among churned clients' : 'no churned clients yet'} />
          <StatCard label="Churn Rate" value={ytd.churnRetention?.churnRatePct != null ? pct(ytd.churnRetention.churnRatePct) : '—'} color={ytd.churnRetention?.churnRatePct ? 'var(--red)' : 'var(--text-muted)'} icon={<TrendingDown size={16} />} sub="latest month" />
          <StatCard label="Retention Rate" value={ytd.churnRetention?.retentionRatePct != null ? pct(ytd.churnRetention.retentionRatePct) : '—'} color="var(--green)" icon={<TrendingUp size={16} />} sub="latest month" />
        </div>
      </div>

      <ClientStageBreakdown rows={clientStageBreakdown} />
      <ClientLtvTable rows={clientLtvBreakdown} />

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Months</h3>
        {years.length > 1 ? (
          <div className="space-y-3">
            {years.map(y => <YearGroup key={y} year={y} months={byYear[y]} latestMonth={months[months.length - 1].month} onEntryChange={load} />)}
          </div>
        ) : (
          <div className="space-y-2">
            {months.slice().reverse().map((m: any) => (
              <MonthCard key={m.month} month={m} defaultExpanded={m.month === months[months.length - 1].month} onEntryChange={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Preferred display order for the Kanban journey stages — anything not in
// this list (e.g. the legacy 'Active' default a client starts at before its
// first drag) is appended at the end rather than dropped, so the counts
// still add up to the real total even for stages this list doesn't know about.
const STAGE_ORDER = ['Onboarding', 'Launching', '14 Day Check-in', '28 Day Check-in', 'Month 1', 'Month 2', 'Month 3+', 'At Risk', 'Churned'];

// "How many moved to Month 1/2/3, how many churned" as a standing figure —
// counts clients currently sitting at each Kanban stage.
function ClientStageBreakdown({ rows }: { rows: { status: string; count: number }[] }) {
  const byStatus = new Map(rows.map(r => [r.status, r.count]));
  const known = STAGE_ORDER.filter(s => byStatus.has(s));
  const unknown = rows.map(r => r.status).filter(s => !STAGE_ORDER.includes(s));
  const ordered = [...known, ...unknown];
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
        Client Journey — {total} Total
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {ordered.map(status => (
          <div key={status} className="card px-4 py-3">
            <p className="text-xs mb-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{status}</p>
            <p className="font-bold text-xl" style={{ color: status === 'Churned' ? 'var(--red)' : status === 'At Risk' ? 'var(--yellow)' : 'var(--text)' }}>
              {byStatus.get(status)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientLtvTable({ rows }: { rows: { id: number; name: string; clientStatus: string; monthsPaid: number; retainerPrice: number; ltv: number }[] }) {
  const [open, setOpen] = useState(true);
  if (rows.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between text-left" style={{ background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-semibold text-sm">Per-Client LTV</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rows.length} clients · sorted highest first</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Client', 'Stage', 'Months Paid', 'Retainer', 'LTV'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : undefined, opacity: r.clientStatus === 'Churned' ? 0.6 : 1 }}>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{r.clientStatus}</td>
                  <td className="px-4 py-2">{r.monthsPaid}</td>
                  <td className="px-4 py-2">{fmt$(r.retainerPrice)}/mo</td>
                  <td className="px-4 py-2 font-semibold" style={{ color: 'var(--accent)' }}>{fmt$(r.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function YearGroup({ year, months, latestMonth, onEntryChange }: { year: string; months: any[]; latestMonth: string; onEntryChange: () => void }) {
  const [open, setOpen] = useState(year === new Date().getFullYear().toString());
  const yearRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const yearNetProfit = months.reduce((s, m) => s + m.netProfit, 0);

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between text-left" style={{ background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-semibold">{year}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>{fmt$(yearRevenue)} revenue</span>
          <span className="font-semibold" style={{ color: yearNetProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt$(yearNetProfit)} net</span>
        </div>
      </button>
      {open && (
        <div className="p-3 space-y-2" style={{ background: 'var(--background)' }}>
          {months.slice().reverse().map(m => <MonthCard key={m.month} month={m} defaultExpanded={m.month === latestMonth} onEntryChange={onEntryChange} />)}
        </div>
      )}
    </div>
  );
}

function MonthCard({ month, defaultExpanded, onEntryChange }: { month: any; defaultExpanded?: boolean; onEntryChange: () => void }) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState<'other' | null>(null);
  // Derived fresh every render — never cached in local state, so a carry-forward
  // ripple from editing a DIFFERENT month (which refreshes `month` via the
  // parent's summary refetch) is never masked by a stale snapshot here.
  const pnl = detail?.pnl ?? month;
  const churn = detail?.churnRetention ?? month.churnRetention;

  const loadDetail = useCallback(() => {
    setLoadingDetail(true);
    fetch(`/api/admin/income/monthly?month=${month.month}`).then(r => r.json()).then(d => { setDetail(d); setLoadingDetail(false); });
  }, [month.month]);

  useEffect(() => { if (defaultExpanded) loadDetail(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) loadDetail();
  };

  const setItemMonth = async (itemId: number, amount: number) => {
    await fetch('/api/admin/income/items/monthly-value', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, month: month.month, amount }),
    });
    loadDetail();
    onEntryChange();
  };

  const setOverride = async (field: 'revenue' | 'adSpend' | 'payroll' | 'totalOperatingExpenses', amount: number) => {
    await fetch('/api/admin/income/monthly-override', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: month.month, field, amount }),
    });
    loadDetail();
    onEntryChange();
  };
  const revertOverride = async (field: 'revenue' | 'adSpend' | 'payroll' | 'totalOperatingExpenses') => {
    await fetch(`/api/admin/income/monthly-override?month=${month.month}&field=${field}`, { method: 'DELETE' });
    loadDetail();
    onEntryChange();
  };

  const accentColor = pnl.netProfit >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="card overflow-hidden" style={{ borderLeft: `3px solid ${accentColor}` }}>
      <button onClick={toggle} className="w-full px-4 py-3 flex items-center justify-between text-left hover:opacity-90 transition-opacity">
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="font-semibold text-sm">{month.label}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>{fmt$(pnl.revenue)} rev</span>
          <span className="font-semibold w-20 text-right" style={{ color: accentColor }}>{fmt$(pnl.netProfit)}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {loadingDetail || !detail ? (
            <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : (
            <div className="py-2 text-sm">
              <SectionLabel first>Revenue</SectionLabel>
              <EditableAmountRow
                label="Monthly Revenue" amount={pnl.revenue} source={pnl.revenueSource}
                sub="entered manually — not synced from Whop or anywhere else"
                onSave={v => setOverride('revenue', v)} onRevert={() => revertOverride('revenue')}
              />

              <SectionLabel>Cost of Goods Sold</SectionLabel>
              <EditableAmountRow
                label="Ad Spend (Meta)" amount={pnl.adSpend} source={pnl.adSpendSource}
                onSave={v => setOverride('adSpend', v)} onRevert={() => revertOverride('adSpend')}
              />
              <Row label="Gross Profit" value={fmt$(pnl.grossProfit)} bold color="#0891b2" emphasize />
              <Row label="Gross Margin" value={pct(pnl.grossMarginPct)} muted indent={1} />

              <SectionLabel>Operating Expenses</SectionLabel>
              <EditableAmountRow
                label="Payroll" amount={pnl.employeeCosts} source={pnl.employeeCostsSource}
                sub="overrides the real payroll total below for this month's P&L"
                onSave={v => setOverride('payroll', v)} onRevert={() => revertOverride('payroll')}
              />
              <HumanLaborBreakdown
                items={detail.humanLaborItems ?? []}
                total={(detail.humanLaborItems ?? []).reduce((s: number, i: any) => s + i.amount, 0)}
              />
              <MonthlyItemSection title="Recurring Subscriptions" items={detail.subscriptions} onSave={setItemMonth} bare />
              <EntrySection
                title="Other Operating Expenses" entries={detail.otherExpenseEntries} category="other" month={month.month}
                onAdd={() => setShowAddEntry('other')} onChange={() => { loadDetail(); onEntryChange(); }} bare
              />
              <EditableAmountRow
                label="Total Operating Expenses" amount={pnl.totalOperatingExpenses} source={pnl.totalOperatingExpensesSource}
                sub="overrides the sum of the line items above for this month's P&L"
                onSave={v => setOverride('totalOperatingExpenses', v)} onRevert={() => revertOverride('totalOperatingExpenses')}
                emphasize
              />

              <SectionLabel>Net Profit</SectionLabel>
              <Row label="Net Profit" value={fmt$(pnl.netProfit)} bold color={accentColor} bg={pnl.netProfit >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'} />
              <Row label="Profit Margin" value={pct(pnl.profitMarginPct)} muted indent={1} />
              <Row label="ROAS" value={pnl.roas != null ? `${pnl.roas.toFixed(2)}x` : '—'} muted indent={1} />

              {churn && (
                <>
                  <SectionLabel>Client Retention</SectionLabel>
                  <Row label="Active at Start of Month" value={String(churn.activeAtStart)} muted />
                  <Row label="Churned During Month" value={String(churn.churnedDuring)} muted />
                  <Row label="Churn Rate" value={churn.churnRatePct != null ? pct(churn.churnRatePct) : '—'} bold color={churn.churnRatePct ? 'var(--red)' : undefined} />
                  <Row label="Retention Rate" value={churn.retentionRatePct != null ? pct(churn.retentionRatePct) : '—'} bold color="var(--green)" />
                </>
              )}

              {showAddEntry && (
                <AddEntryModal
                  month={month.month}
                  onClose={() => setShowAddEntry(null)}
                  onSaved={() => { setShowAddEntry(null); loadDetail(); onEntryChange(); }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthlyItemSection({ title, items, onSave, bare }: {
  title: string; items: any[]; onSave: (itemId: number, amount: number) => void; bare?: boolean;
}) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const header = (
    <div
      className={bare ? 'px-4 py-2.5 flex items-center justify-between' : 'px-4 py-3 border-b flex items-center justify-between'}
      style={bare ? undefined : { borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <p className={bare ? 'font-semibold' : 'font-semibold text-sm'}>{title}</p>
      <span className="text-sm font-semibold">{fmt$(total)}</span>
    </div>
  );
  const body = items.length === 0 ? (
    <p className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)', paddingLeft: bare ? 32 : undefined }}>Nothing here yet — add items in Subscriptions.</p>
  ) : (
    <div className={bare ? undefined : 'divide-y'} style={bare ? undefined : { borderColor: 'var(--border)' }}>
      {items.map((item: any) => (
        <div key={item.id} className="px-4 py-1.5 flex items-center justify-between text-sm gap-3" style={{ paddingLeft: bare ? 32 : undefined }}>
          <div className="min-w-0">
            <span className={bare ? undefined : 'font-medium truncate'} style={bare ? { color: 'var(--text-muted)' } : undefined}>{item.name}</span>
            {item.isOverride && (
              <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ background: 'rgba(13,155,110,0.15)', color: 'var(--accent)' }}>edited this month</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              defaultValue={item.amount}
              key={item.amount}
              onBlur={e => {
                const v = Number(e.target.value);
                if (v !== item.amount) onSave(item.id, v);
              }}
              className="input text-sm w-24 text-right"
            />
          </div>
        </div>
      ))}
    </div>
  );
  if (bare) return <div>{header}{body}</div>;
  return <div className="card overflow-hidden">{header}{body}</div>;
}

function EntrySection({ title, entries, category, month, onAdd, onChange, bare }: {
  title: string; entries: any[]; category: string; month: string; onAdd: () => void; onChange: () => void; bare?: boolean;
}) {
  const del = async (id: number) => {
    await fetch(`/api/admin/income/entries/${id}`, { method: 'DELETE' });
    onChange();
  };
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const header = (
    <div
      className={bare ? 'px-4 py-2.5 flex items-center justify-between' : 'px-4 py-3 border-b flex items-center justify-between'}
      style={bare ? undefined : { borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <p className={bare ? 'font-semibold' : 'font-semibold text-sm'}>{title}</p>
      <div className="flex items-center gap-3">
        {bare && <span className="text-sm font-semibold">{fmt$(total)}</span>}
        <button onClick={onAdd} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
      </div>
    </div>
  );
  const body = entries.length === 0 ? (
    <p className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)', paddingLeft: bare ? 32 : undefined }}>No entries for this month.</p>
  ) : (
    <div className={bare ? undefined : 'divide-y'} style={bare ? undefined : { borderColor: 'var(--border)' }}>
      {entries.map(e => (
        <div key={e.id} className="px-4 py-1.5 flex items-center justify-between text-sm" style={{ paddingLeft: bare ? 32 : undefined }}>
          <div>
            <span className={bare ? undefined : 'font-medium'} style={bare ? { color: 'var(--text-muted)' } : undefined}>{e.name}</span>
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{e.date}</span>
            {e.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{e.notes}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span className={bare ? undefined : 'font-semibold'} style={bare ? { color: 'var(--text-muted)' } : undefined}>{fmt$(e.amount)}</span>
            <button onClick={() => del(e.id)} className="opacity-50 hover:opacity-100"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
  if (bare) return <div>{header}{body}</div>;
  return <div className="card overflow-hidden">{header}{body}</div>;
}

function AddEntryModal({ month, onClose, onSaved }: {
  month: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(`${month}-01`);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name || !amount) return;
    setSaving(true);
    await fetch('/api/admin/income/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category: 'other', amount: Number(amount), date, notes }),
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Add Expense</h3>
        <div className="space-y-3">
          <input className="input w-full text-sm" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="input w-full text-sm" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="input w-full text-sm" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <textarea className="input w-full text-sm" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Subscriptions View ───────────────────────────────────────────────────────
// Manages the roster (add/remove) — actual month-by-month amounts are edited
// by expanding a month card in Overview. Amounts shown here reflect the
// current calendar month.
function SubscriptionsView() {
  const [monthly, setMonthly] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);

  const load = useCallback(() => {
    fetch('/api/admin/income/monthly').then(r => r.json()).then(d => { setMonthly(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !monthly) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  const subscriptions = monthly.subscriptions ?? [];
  const humanLaborItems = monthly.humanLaborItems ?? [];
  const subsTotal = subscriptions.reduce((s: number, i: any) => s + i.amount, 0);
  const humanLaborTotal = humanLaborItems.reduce((s: number, i: any) => s + i.amount, 0);

  const remove = async (id: number) => {
    await fetch(`/api/admin/income/items/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-6">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Amounts below are for {monthly.label} (current month) — to change what a specific past or future month spent, expand it in Overview.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Software Subscriptions" value={fmt$(subsTotal)} sub={`${subscriptions.length} active · ${fmt$(subsTotal * 12)}/yr`} color="#0d9488" icon={<Layers size={16} />} />
        <StatCard label="Human Labor (Payroll)" value={fmt$(humanLaborTotal)} sub={`${humanLaborItems.length} active · ${fmt$(humanLaborTotal * 12)}/yr`} color="#6c63ff" icon={<Users size={16} />} />
        <StatCard label="Ad Spend" value={fmt$(monthly.pnl?.adSpend ?? 0)} sub={`live, ${monthly.label}`} color="#f59e0b" icon={<TrendingDown size={16} />} />
      </div>

      <ItemTable title="Software & Subscriptions" items={subscriptions} onAdd={() => setShowAddItem(true)} onDelete={remove} />

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div>
            <p className="font-semibold text-sm">Human Labor / Payroll</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Synced live from the Payroll Dashboard — read-only here.</p>
          </div>
          <Link href="/admin/payroll" className="btn-ghost text-xs flex items-center gap-1 shrink-0"><Users size={12} /> Manage in Payroll →</Link>
        </div>
        {humanLaborItems.length === 0 ? (
          <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No active employees yet — add one in the Payroll Dashboard.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {humanLaborItems.map((item: any) => (
              <div key={item.employeeId} className="px-4 py-2.5 flex items-center justify-between text-sm gap-3">
                <div className="min-w-0">
                  <span className="font-medium truncate">{item.name}</span>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{item.role}</span>
                </div>
                <span className="font-semibold shrink-0">{fmt$(item.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddItem && (
        <AddItemModal category="subscription" onClose={() => setShowAddItem(false)} onSaved={() => { setShowAddItem(false); load(); }} />
      )}
    </div>
  );
}

function ItemTable({ title, items, onAdd, onDelete }: {
  title: string; items: any[]; onAdd: () => void; onDelete: (id: number) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <p className="font-semibold text-sm">{title}</p>
        <button onClick={onAdd} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>Nothing here yet.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {items.map(item => (
            <div key={item.id} className="px-4 py-2.5 flex items-center justify-between text-sm gap-3">
              <span className="font-medium min-w-0 truncate">{item.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-semibold">{fmt$(item.amount)}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/mo</span>
                <button onClick={() => onDelete(item.id)} className="opacity-50 hover:opacity-100"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddItemModal({ category, onClose, onSaved }: { category: 'subscription'; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name) return;
    setSaving(true);
    await fetch('/api/admin/income/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, monthly_amount: Number(amount) || 0 }),
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Add Subscription</h3>
        <div className="space-y-3">
          <input className="input w-full text-sm" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="input w-full text-sm" type="number" placeholder="Monthly amount" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function IncomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const [tab, setTab] = useState<'overview' | 'subscriptions'>('overview');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (user?.role !== 'admin' || !user?.canViewFinancials)) router.push('/admin/home');
  }, [status, user, router]);

  if (status !== 'authenticated' || user?.role !== 'admin' || !user?.canViewFinancials) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <ListChecks size={14} /> },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <Link href="/admin/home" className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> Home
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2"><DollarSign size={16} style={{ color: '#0d9488' }} /> Income Statement</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>USD</span>
        </div>
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
              style={{
                background: tab === t.id ? 'var(--accent)' : 'transparent',
                color: tab === t.id ? 'white' : 'var(--text-muted)',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="px-6 py-6">
        {tab === 'overview' && <OverviewView />}
        {tab === 'subscriptions' && <SubscriptionsView />}
      </div>
    </div>
  );
}

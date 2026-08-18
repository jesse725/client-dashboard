'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Layers,
  Calendar, Plus, Trash2, Users, Wallet, LayoutDashboard, CalendarDays, ListChecks,
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

// ── Dashboard View ───────────────────────────────────────────────────────────
function DashboardView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/income/summary').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (!data || data.error) return <p className="text-sm" style={{ color: 'var(--red)' }}>{data?.error || 'Failed to load'}</p>;

  const { months, ytd, startupFunds, warnings } = data;

  return (
    <div className="space-y-6">
      <Warnings warnings={warnings} />

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Income Statement (Cycle-to-Date)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Revenue" value={fmt$(ytd.revenue)} color="#6c63ff" icon={<DollarSign size={16} />} />
          <StatCard label="Total Ad Spend" value={fmt$(ytd.adSpend)} color="#f59e0b" icon={<TrendingDown size={16} />} />
          <StatCard label="Gross Profit" value={fmt$(ytd.grossProfit)} color="#0891b2" icon={<TrendingUp size={16} />} />
          <StatCard label="Net Profit" value={fmt$(ytd.netProfit)} color={ytd.netProfit >= 0 ? 'var(--green)' : 'var(--red)'} icon={<Wallet size={16} />} />
          <StatCard label="Avg Profit Margin" value={ytd.avgProfitMarginPct != null ? pct(ytd.avgProfitMarginPct) : '—'} color="#16a34a" icon={<Layers size={16} />} />
          <StatCard label="Avg ROAS" value={ytd.avgRoas != null ? `${ytd.avgRoas.toFixed(2)}x` : '—'} color="#0d9488" icon={<TrendingUp size={16} />} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Startup Fund Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {startupFunds.map((f: any) => (
            <div key={f.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{f.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {pct(f.pctUtilized * 100)} utilized
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full" style={{ width: `${Math.min(100, f.pctUtilized * 100)}%`, background: 'var(--accent)' }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><p style={{ color: 'var(--text-muted)' }}>Allocated</p><p className="font-semibold">{fmt$(f.allocated)}</p></div>
                <div><p style={{ color: 'var(--text-muted)' }}>Spent</p><p className="font-semibold">{fmt$(f.spent)}</p></div>
                <div><p style={{ color: 'var(--text-muted)' }}>Remaining</p><p className="font-semibold" style={{ color: 'var(--green)' }}>{fmt$(f.remaining)}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <p className="font-semibold text-sm">Monthly Trend</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Metric</th>
                {months.map((m: any) => (
                  <th key={m.month} className="text-right px-4 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'revenue', label: 'Revenue', fmt: fmt$ },
                { key: 'adSpend', label: 'Ad Spend', fmt: fmt$ },
                { key: 'grossProfit', label: 'Gross Profit', fmt: fmt$ },
                { key: 'totalOperatingExpenses', label: 'Total Expenses', fmt: fmt$ },
                { key: 'netProfit', label: 'Net Profit', fmt: fmt$ },
                { key: 'profitMarginPct', label: 'Profit Margin', fmt: pct },
                { key: 'roas', label: 'ROAS', fmt: (v: number | null) => v != null ? `${v.toFixed(2)}x` : '—' },
              ].map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 font-medium">{row.label}</td>
                  {months.map((m: any) => (
                    <td key={m.month} className="text-right px-4 py-2 whitespace-nowrap">{row.fmt(m[row.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Monthly View ─────────────────────────────────────────────────────────────
function MonthlyView() {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddEntry, setShowAddEntry] = useState<'other' | 'startup_fund' | null>(null);

  const load = useCallback((m?: string) => {
    setLoading(true);
    const url = m ? `/api/admin/income/monthly?month=${m}` : '/api/admin/income/monthly';
    fetch(url).then(r => r.json()).then(d => { setData(d); setMonth(d.month); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  if (data.error) return <p className="text-sm" style={{ color: 'var(--red)' }}>{data.error}</p>;

  const { pnl, cumulativeProfit, otherExpenseEntries, startupFundEntries, availableMonths, warnings } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
        <select
          value={month ?? ''}
          onChange={e => load(e.target.value)}
          className="input text-sm w-40"
        >
          {availableMonths.map((m: string) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <Warnings warnings={warnings} />

      <div className="card overflow-hidden max-w-2xl">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <p className="font-semibold text-sm">{data.label} — Income Statement</p>
        </div>
        <div className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
          <Row label="Revenue" value={fmt$(pnl.revenue)} />
          <Row label="Whop Fees (3.2%)" value={`(${fmt$(pnl.whopFees)})`} muted />
          <Row label="Gross Revenue" value={fmt$(pnl.grossRevenue)} bold />
          <Row label="Ad Spend (COGS)" value={`(${fmt$(pnl.adSpend)})`} muted />
          <Row label="Gross Profit" value={fmt$(pnl.grossProfit)} bold color="#0891b2" />
          <Row label="Gross Margin" value={pct(pnl.grossMarginPct)} muted />
          <Row label="Recurring Subscriptions" value={`(${fmt$(pnl.recurringSubscriptions)})`} muted />
          <Row label="Employee Costs" value={`(${fmt$(pnl.employeeCosts)})`} muted />
          <Row label="Other Operating Expenses" value={`(${fmt$(pnl.otherExpenses)})`} muted />
          <Row label="Total Operating Expenses" value={fmt$(pnl.totalOperatingExpenses)} bold />
          <Row label="Net Profit" value={fmt$(pnl.netProfit)} bold color={pnl.netProfit >= 0 ? 'var(--green)' : 'var(--red)'} />
          <Row label="Profit Margin" value={pct(pnl.profitMarginPct)} muted />
          <Row label="ROAS" value={pnl.roas != null ? `${pnl.roas.toFixed(2)}x` : '—'} muted />
          <Row label="Startup Fund Draws" value={fmt$(pnl.startupFundDraws)} muted sub="excluded from Net Profit — one-time seed capital" />
          <Row label="Cumulative Profit (cycle-to-date)" value={fmt$(cumulativeProfit)} bold color="var(--accent)" />
        </div>
      </div>

      <EntrySection
        title="Other Operating Expenses"
        entries={otherExpenseEntries}
        category="other"
        month={month!}
        onAdd={() => setShowAddEntry('other')}
        onChange={() => load(month!)}
      />
      <EntrySection
        title="Startup Fund Draws"
        entries={startupFundEntries}
        category="startup_fund"
        month={month!}
        onAdd={() => setShowAddEntry('startup_fund')}
        onChange={() => load(month!)}
      />

      {showAddEntry && (
        <AddEntryModal
          category={showAddEntry}
          month={month!}
          onClose={() => setShowAddEntry(null)}
          onSaved={() => { setShowAddEntry(null); load(month!); }}
        />
      )}
    </div>
  );
}

function Row({ label, value, bold, muted, color, sub }: { label: string; value: string; bold?: boolean; muted?: boolean; color?: string; sub?: string }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <div>
        <span className={bold ? 'font-semibold' : ''} style={{ color: muted ? 'var(--text-muted)' : undefined }}>{label}</span>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      <span className={bold ? 'font-bold' : ''} style={{ color: color ?? (muted ? 'var(--text-muted)' : undefined) }}>{value}</span>
    </div>
  );
}

function EntrySection({ title, entries, category, month, onAdd, onChange }: {
  title: string; entries: any[]; category: string; month: string; onAdd: () => void; onChange: () => void;
}) {
  const del = async (id: number) => {
    await fetch(`/api/admin/income/entries/${id}`, { method: 'DELETE' });
    onChange();
  };
  return (
    <div className="card overflow-hidden max-w-2xl">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <p className="font-semibold text-sm">{title}</p>
        <button onClick={onAdd} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} /> Add</button>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No entries for this month.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {entries.map(e => (
            <div key={e.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">{e.name}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{e.date}</span>
                {e.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{e.notes}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{fmt$(e.amount)}</span>
                <button onClick={() => del(e.id)} className="opacity-50 hover:opacity-100"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddEntryModal({ category, month, onClose, onSaved }: {
  category: 'other' | 'startup_fund'; month: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(`${month}-01`);
  const [notes, setNotes] = useState('');
  const [fundId, setFundId] = useState('');
  const [funds, setFunds] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category === 'startup_fund') {
      fetch('/api/admin/income/funds').then(r => r.json()).then(d => setFunds(d.funds ?? []));
    }
  }, [category]);

  const save = async () => {
    if (!name || !amount || (category === 'startup_fund' && !fundId)) return;
    setSaving(true);
    await fetch('/api/admin/income/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, amount: Number(amount), date, notes, fund_id: fundId ? Number(fundId) : undefined }),
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Add {category === 'other' ? 'Expense' : 'Fund Draw'}</h3>
        <div className="space-y-3">
          <input className="input w-full text-sm" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="input w-full text-sm" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="input w-full text-sm" type="date" value={date} onChange={e => setDate(e.target.value)} />
          {category === 'startup_fund' && (
            <select className="input w-full text-sm" value={fundId} onChange={e => setFundId(e.target.value)}>
              <option value="">Select fund…</option>
              {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
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
function SubscriptionsView() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adSpend, setAdSpend] = useState<{ month: string; amount: number } | null>(null);
  const [showAddItem, setShowAddItem] = useState<'subscription' | 'payroll' | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/income/items').then(r => r.json()).then(d => { setItems(d.items ?? []); setLoading(false); });
  }, []);

  useEffect(() => {
    load();
    fetch('/api/admin/income/monthly').then(r => r.json()).then(d => {
      if (d.pnl) setAdSpend({ month: d.label, amount: d.pnl.adSpend });
    });
  }, [load]);

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;

  const subscriptions = items.filter(i => i.category === 'subscription' && i.active);
  const payroll = items.filter(i => i.category === 'payroll' && i.active);
  const subsTotal = subscriptions.reduce((s, i) => s + i.monthly_amount, 0);
  const payrollTotal = payroll.reduce((s, i) => s + i.monthly_amount, 0);

  const update = async (id: number, field: string, value: any) => {
    await fetch(`/api/admin/income/items/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
    });
    load();
  };
  const remove = async (id: number) => {
    await fetch(`/api/admin/income/items/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Software Subscriptions" value={fmt$(subsTotal)} sub={`${subscriptions.length} active · ${fmt$(subsTotal * 12)}/yr`} color="#0d9488" icon={<Layers size={16} />} />
        <StatCard label="Human Labor (Payroll)" value={fmt$(payrollTotal)} sub={`${payroll.length} active · ${fmt$(payrollTotal * 12)}/yr`} color="#6c63ff" icon={<Users size={16} />} />
        <StatCard label="Ad Spend" value={adSpend ? fmt$(adSpend.amount) : '—'} sub={adSpend ? `live, ${adSpend.month}` : 'not connected'} color="#f59e0b" icon={<TrendingDown size={16} />} />
      </div>

      <ItemTable
        title="Software & Subscriptions" category="subscription" items={subscriptions}
        onAdd={() => setShowAddItem('subscription')} onUpdate={update} onDelete={remove}
      />
      <ItemTable
        title="Human Labor / Payroll" category="payroll" items={payroll}
        onAdd={() => setShowAddItem('payroll')} onUpdate={update} onDelete={remove}
      />

      {showAddItem && (
        <AddItemModal category={showAddItem} onClose={() => setShowAddItem(null)} onSaved={() => { setShowAddItem(null); load(); }} />
      )}
    </div>
  );
}

function ItemTable({ title, items, onAdd, onUpdate, onDelete }: {
  title: string; category: string; items: any[]; onAdd: () => void;
  onUpdate: (id: number, field: string, value: any) => void; onDelete: (id: number) => void;
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
                <input
                  type="number"
                  defaultValue={item.monthly_amount}
                  onBlur={e => {
                    const v = Number(e.target.value);
                    if (v !== item.monthly_amount) onUpdate(item.id, 'monthly_amount', v);
                  }}
                  className="input text-sm w-24 text-right"
                />
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

function AddItemModal({ category, onClose, onSaved }: { category: 'subscription' | 'payroll'; onClose: () => void; onSaved: () => void }) {
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
        <h3 className="font-semibold mb-4">Add {category === 'subscription' ? 'Subscription' : 'Payroll'}</h3>
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
  const [tab, setTab] = useState<'dashboard' | 'monthly' | 'subscriptions'>('dashboard');

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
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
    { id: 'monthly', label: 'Monthly', icon: <CalendarDays size={14} /> },
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
          <span className="font-semibold flex items-center gap-2"><DollarSign size={16} style={{ color: '#0d9488' }} /> Income & Earnings</span>
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
        {tab === 'dashboard' && <DashboardView />}
        {tab === 'monthly' && <MonthlyView />}
        {tab === 'subscriptions' && <SubscriptionsView />}
      </div>
    </div>
  );
}

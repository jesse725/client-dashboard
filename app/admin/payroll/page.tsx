'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Plus, ChevronDown, ChevronRight, CheckCircle2, Clock,
  Download, Trash2, AlertTriangle,
} from 'lucide-react';

function fmt$(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }: { status: 'pending' | 'paid' }) {
  const paid = status === 'paid';
  return (
    <span
      className="text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 w-fit shrink-0"
      style={{ background: paid ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: paid ? 'var(--green)' : 'var(--yellow)' }}
    >
      {paid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
      {paid ? 'Paid' : 'Pending'}
    </span>
  );
}

// ── Employee Card ────────────────────────────────────────────────────────────
function EmployeeCard({ employee, onChange }: { employee: any; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [bonusDesc, setBonusDesc] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');

  const cp = employee.currentPeriod;

  const loadDetail = useCallback(() => {
    setLoadingDetail(true);
    fetch(`/api/admin/payroll/employees/${employee.id}`).then(r => r.json()).then(d => { setDetail(d); setLoadingDetail(false); });
  }, [employee.id]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) loadDetail();
  };

  const startEdit = () => {
    setForm({
      name: employee.name, role: employee.role, email: employee.email, active: !!employee.active,
      baseAmountPerPeriod: employee.base_amount_per_period, perClientFee: employee.per_client_fee,
      revenueSharePct: employee.revenue_share_pct, hourlyBonusRate: employee.hourly_bonus_rate,
      hourlyBonusThresholdMinutes: employee.hourly_bonus_threshold_minutes, notes: employee.notes ?? '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    await fetch(`/api/admin/payroll/employees/${employee.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    setEditing(false);
    loadDetail();
    onChange();
  };

  const addBonus = async () => {
    if (!cp || !bonusDesc || !bonusAmount) return;
    await fetch(`/api/admin/payroll/periods/${cp.id}/bonus`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: bonusDesc, amount: Number(bonusAmount) }),
    });
    setBonusDesc(''); setBonusAmount('');
    loadDetail();
    onChange();
  };

  const removeBonus = async (periodId: number, bonusId: number) => {
    await fetch(`/api/admin/payroll/periods/${periodId}/bonus?bonusId=${bonusId}`, { method: 'DELETE' });
    loadDetail();
    onChange();
  };

  const markPaid = async () => {
    if (!cp) return;
    await fetch(`/api/admin/payroll/periods/${cp.id}/mark-paid`, { method: 'POST' });
    loadDetail();
    onChange();
  };

  const undoPaid = async (periodId: number) => {
    await fetch(`/api/admin/payroll/periods/${periodId}/mark-paid`, { method: 'DELETE' });
    loadDetail();
    onChange();
  };

  const inactive = !employee.active;
  const isPlaceholderEmail = employee.email.endsWith('@example.invalid');

  return (
    <div className="card overflow-hidden" style={{ opacity: inactive ? 0.6 : 1 }}>
      <button onClick={toggle} className="w-full px-4 py-3 flex items-center justify-between text-left hover:opacity-90 transition-opacity gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{employee.name} {inactive && <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(inactive)</span>}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{employee.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {cp && <StatusPill status={cp.status} />}
          <span className="font-semibold w-16 text-right text-sm">{cp ? fmt$(cp.totalAmount) : '—'}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
          {isPlaceholderEmail && (
            <div className="text-xs p-2.5 rounded-lg flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--yellow)' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>This employee has a placeholder email ({employee.email}) — they can't log in until you set their real one.</span>
            </div>
          )}

          {loadingDetail || !detail ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : editing ? (
            <div className="card-2 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><input className="input text-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Role / Title"><input className="input text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></Field>
              </div>
              <Field label="Email"><input className="input text-sm" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Base / period ($)"><input type="number" className="input text-sm" value={form.baseAmountPerPeriod} onChange={e => setForm({ ...form, baseAmountPerPeriod: Number(e.target.value) })} /></Field>
                <Field label="Per-client fee ($)"><input type="number" className="input text-sm" value={form.perClientFee} onChange={e => setForm({ ...form, perClientFee: Number(e.target.value) })} /></Field>
                <Field label="Revenue share (%)"><input type="number" className="input text-sm" value={form.revenueSharePct} onChange={e => setForm({ ...form, revenueSharePct: Number(e.target.value) })} /></Field>
                <Field label="Hourly bonus rate ($/hr)"><input type="number" className="input text-sm" value={form.hourlyBonusRate} onChange={e => setForm({ ...form, hourlyBonusRate: Number(e.target.value) })} /></Field>
                <Field label="Bonus threshold (min)"><input type="number" className="input text-sm" value={form.hourlyBonusThresholdMinutes} onChange={e => setForm({ ...form, hourlyBonusThresholdMinutes: Number(e.target.value) })} /></Field>
                <Field label="Active">
                  <select className="input text-sm" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
                    <option value="1">Active</option>
                    <option value="0">Inactive (blocks login)</option>
                  </select>
                </Field>
              </div>
              <Field label="Notes"><textarea className="input text-sm w-full" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(false)} className="btn-ghost text-sm">Cancel</button>
                <button onClick={saveEdit} className="btn-primary text-sm">Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="card-2 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Pay Structure</p>
                  <button onClick={startEdit} className="btn-ghost text-xs">Edit</button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Base / period</span><span className="text-right font-medium">{fmt$(employee.base_amount_per_period)}</span>
                  {employee.per_client_fee > 0 && (<><span style={{ color: 'var(--text-muted)' }}>Per-client fee</span><span className="text-right font-medium">{fmt$(employee.per_client_fee)}</span></>)}
                  {employee.revenue_share_pct > 0 && (<><span style={{ color: 'var(--text-muted)' }}>Revenue share</span><span className="text-right font-medium">{employee.revenue_share_pct}%</span></>)}
                  {employee.hourly_bonus_rate > 0 && (<><span style={{ color: 'var(--text-muted)' }}>Hourly bonus</span><span className="text-right font-medium">{fmt$(employee.hourly_bonus_rate)}/hr past {employee.hourly_bonus_threshold_minutes}min</span></>)}
                </div>
                {employee.notes && <p className="text-xs mt-3 pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>{employee.notes}</p>}
              </div>

              {cp && (
                <div className="card-2 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      Current Period · {fmtDate(cp.payout_date)}
                    </p>
                    <StatusPill status={cp.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span style={{ color: 'var(--text-muted)' }}>Base</span>
                    <span className="font-medium">{fmt$(cp.base_amount)}</span>
                  </div>
                  {cp.bonusItems.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between text-sm mb-2 gap-2">
                      <div className="min-w-0">
                        <p className="truncate">{b.description}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>by {b.added_by} · {fmtDate(b.added_at.slice(0, 10))}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-medium" style={{ color: 'var(--green)' }}>+{fmt$(b.amount)}</span>
                        <button onClick={() => removeBonus(cp.id, b.id)} className="opacity-50 hover:opacity-100"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-bold pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span>Total</span>
                    <span>{fmt$(cp.totalAmount)}</span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <input placeholder="Bonus description" value={bonusDesc} onChange={e => setBonusDesc(e.target.value)} className="input text-sm flex-1 min-w-0" />
                    <input type="number" placeholder="$" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} className="input text-sm w-20" />
                    <button onClick={addBonus} className="btn-ghost text-xs px-3 shrink-0"><Plus size={13} /></button>
                  </div>

                  <div className="mt-3">
                    {cp.status === 'pending' ? (
                      <button onClick={markPaid} className="btn-primary text-sm w-full">Mark Period as Paid</button>
                    ) : (
                      <button onClick={() => undoPaid(cp.id)} className="btn-ghost text-sm w-full">Undo — Mark as Pending</button>
                    )}
                  </div>
                </div>
              )}

              {detail.periods.length > 1 && (
                <div className="card-2 overflow-hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide px-4 pt-3 pb-2" style={{ color: 'var(--text-muted)' }}>History</p>
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {detail.periods.slice(1).map((p: any) => (
                      <div key={p.id} className="px-4 py-2 flex items-center justify-between text-sm">
                        <span>{fmtDate(p.payout_date)}</span>
                        <div className="flex items-center gap-2">
                          <StatusPill status={p.status} />
                          <span className="font-medium w-14 text-right">{fmt$(p.totalAmount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

function AddEmployeeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', role: '', email: '', baseAmountPerPeriod: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name || !form.role || !form.email) return;
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/payroll/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, baseAmountPerPeriod: Number(form.baseAmountPerPeriod) || 0 }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Failed to save');
      setSaving(false);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Add Employee</h3>
        <div className="space-y-3">
          <input className="input w-full text-sm" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input w-full text-sm" placeholder="Role / Title (e.g. Media Buyer)" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
          <input className="input w-full text-sm" type="email" placeholder="Email (used to log in)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input className="input w-full text-sm" type="number" placeholder="Base $ per period" value={form.baseAmountPerPeriod} onChange={e => setForm({ ...form, baseAmountPerPeriod: e.target.value })} />
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}

function ExportSection() {
  const [payoutDates, setPayoutDates] = useState<any[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    fetch('/api/admin/payroll/payout-dates').then(r => r.json()).then(d => {
      setPayoutDates(d.payoutDates ?? []);
      if (d.payoutDates?.[0]) setSelected(d.payoutDates[0].payout_date);
    });
  }, []);

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>Export for Wise</p>
      <div className="flex items-center gap-2 flex-wrap">
        <select className="input text-sm flex-1 min-w-[160px]" value={selected} onChange={e => setSelected(e.target.value)}>
          {payoutDates.map(p => (
            <option key={p.payout_date} value={p.payout_date}>{fmtDate(p.payout_date)} — {p.pendingCount} pending</option>
          ))}
        </select>
        <a
          href={selected ? `/api/admin/payroll/export?payoutDate=${selected}` : undefined}
          className="btn-primary text-sm flex items-center gap-1.5"
          style={{ pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.5 }}
        >
          <Download size={13} /> Export CSV
        </a>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
        Exports pending totals only, for manual entry into Wise. Column layout is a best-effort guess — check it against Wise's real bulk-payment template before a real batch upload.
      </p>
    </div>
  );
}

export default function AdminPayrollPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [dataVersion, setDataVersion] = useState(0); // bumped on any change so ExportSection's stale count refreshes too

  const load = useCallback(() => {
    fetch('/api/admin/payroll/employees').then(r => r.json()).then(d => { setEmployees(d.employees ?? []); setLoading(false); setDataVersion(v => v + 1); });
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role === 'employee') { router.push('/employee'); return; }
    if (status === 'authenticated' && (user?.role !== 'admin' || !user?.canViewFinancials)) router.push('/admin/home');
  }, [status, user, router]);

  useEffect(() => {
    if (status === 'authenticated' && user?.role === 'admin' && user?.canViewFinancials) load();
  }, [status, user, load]);

  if (status !== 'authenticated' || user?.role !== 'admin' || !user?.canViewFinancials || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const activeEmployees = employees.filter(e => e.active);
  const currentTotal = activeEmployees.reduce((s, e) => s + (e.currentPeriod?.totalAmount ?? 0), 0);
  const pendingCount = activeEmployees.filter(e => e.currentPeriod?.status === 'pending').length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10 flex-wrap gap-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          <Link href="/admin/home" className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> Home
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2"><Users size={16} style={{ color: 'var(--accent)' }} /> Payroll</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> Add Employee
        </button>
      </nav>

      <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="card px-4 py-4">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Current Period Total</p>
            <p className="font-bold text-xl" style={{ color: 'var(--accent)' }}>{fmt$(currentTotal)}</p>
          </div>
          <div className="card px-4 py-4 flex items-start gap-3">
            <div className="min-w-0">
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Pending Payouts</p>
              <p className="font-bold text-xl" style={{ color: 'var(--yellow)' }}>{pendingCount} <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>of {activeEmployees.length}</span></p>
            </div>
          </div>
        </div>

        <ExportSection key={dataVersion} />

        <div className="space-y-2">
          {employees.map(e => <EmployeeCard key={e.id} employee={e} onChange={load} />)}
        </div>
      </div>

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

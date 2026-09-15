'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Plus, ChevronDown, ChevronRight, CheckCircle2, Clock,
  Trash2, FileText, Landmark, UserCog, LogIn, Timer, Rocket,
} from 'lucide-react';
import { PAYMENT_METHODS } from '@/lib/payroll-constants';

function methodLabel(value: string): string {
  return PAYMENT_METHODS.find(m => m.value === value)?.label ?? value;
}

function fmt$(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Live-ish countdown to the next payout date — recomputes every minute, no
// need for second-level precision for something days away.
function useCountdown(targetDate: string | null) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;
  const target = new Date(targetDate + 'T00:00:00');
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Due today';
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  if (days === 0) return `${hours}h`;
  return `${days}d ${hours}h`;
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
function EmployeeCard({ employee, assignableOptions, adminUsers, onChange }: { employee: any; assignableOptions: string[]; adminUsers: any[]; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [bonusDesc, setBonusDesc] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');
  const [showRecordPayment, setShowRecordPayment] = useState(false);

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
      hourlyBonusThresholdMinutes: employee.hourly_bonus_threshold_minutes,
      paymentMethod: employee.payment_method ?? 'bank_transfer', agreementUrl: employee.agreement_url ?? '',
      assignedTo: employee.assigned_to ?? '',
      clientOnboardLaunchBonus: employee.client_onboard_launch_bonus ?? 100,
      clientManagementMonthlyFee: employee.client_management_monthly_fee ?? 150,
      linkedUserId: employee.linked_user_id ?? '',
      notes: employee.notes ?? '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    await fetch(`/api/admin/payroll/employees/${employee.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, linkedUserId: form.linkedUserId ? Number(form.linkedUserId) : null }),
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

  // "Variable Pay" is a bonus item like any other, just with a reserved
  // description so this one field can quick-edit it directly (update/create/
  // delete-at-zero) instead of going through the generic add-bonus form.
  const variablePayItem = cp?.bonusItems?.find((b: any) => b.description === 'Variable Pay');
  const setVariablePay = async (amount: number) => {
    if (!cp) return;
    if (amount <= 0) {
      if (variablePayItem) await fetch(`/api/admin/payroll/periods/${cp.id}/bonus?bonusId=${variablePayItem.id}`, { method: 'DELETE' });
    } else if (variablePayItem) {
      await fetch(`/api/admin/payroll/periods/${cp.id}/bonus?bonusId=${variablePayItem.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }),
      });
    } else {
      await fetch(`/api/admin/payroll/periods/${cp.id}/bonus`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Variable Pay', amount }),
      });
    }
    loadDetail();
    onChange();
  };

  const undoPaid = async (periodId: number) => {
    await fetch(`/api/admin/payroll/periods/${periodId}/mark-paid`, { method: 'DELETE' });
    loadDetail();
    onChange();
  };

  const inactive = !employee.active;

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
                <Field label="Payment Method">
                  <select className="input text-sm" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Field>
                <Field label="Assigned To">
                  <select className="input text-sm" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
                    <option value="">Unassigned</option>
                    {assignableOptions.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </Field>
                <Field label="Onboard+Launch bonus ($)"><input type="number" className="input text-sm" value={form.clientOnboardLaunchBonus} onChange={e => setForm({ ...form, clientOnboardLaunchBonus: Number(e.target.value) })} /></Field>
                <Field label="Client mgmt fee ($/mo)"><input type="number" className="input text-sm" value={form.clientManagementMonthlyFee} onChange={e => setForm({ ...form, clientManagementMonthlyFee: Number(e.target.value) })} /></Field>
              </div>
              <Field label="Linked Login (Team/Admin account)">
                <select className="input text-sm w-full" value={form.linkedUserId} onChange={e => setForm({ ...form, linkedUserId: e.target.value })}>
                  <option value="">Not linked — logs in via their own email only</option>
                  {adminUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Lets them see their own payroll by signing in with this Team/Admin account instead of a separate employee email.</p>
              </Field>
              <Field label="Employment Agreement URL"><input className="input text-sm w-full" placeholder="Link to signed agreement (Drive, Dropbox, etc.)" value={form.agreementUrl} onChange={e => setForm({ ...form, agreementUrl: e.target.value })} /></Field>
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
                  {employee.client_onboard_launch_bonus > 0 && (<><span style={{ color: 'var(--text-muted)' }}>Onboard+Launch bonus</span><span className="text-right font-medium">{fmt$(employee.client_onboard_launch_bonus)}/client</span></>)}
                  {employee.client_management_monthly_fee > 0 && (<><span style={{ color: 'var(--text-muted)' }}>Client mgmt fee</span><span className="text-right font-medium">{fmt$(employee.client_management_monthly_fee)}/mo per client</span></>)}
                  <span style={{ color: 'var(--text-muted)' }} className="flex items-center gap-1"><Landmark size={12} /> Payment method</span>
                  <span className="text-right font-medium">{methodLabel(employee.payment_method)}</span>
                  <span style={{ color: 'var(--text-muted)' }} className="flex items-center gap-1"><UserCog size={12} /> Assigned to</span>
                  <span className="text-right font-medium">{employee.assigned_to || '—'}</span>
                  <span style={{ color: 'var(--text-muted)' }} className="flex items-center gap-1"><LogIn size={12} /> Linked login</span>
                  <span className="text-right font-medium">
                    {employee.linked_user_id
                      ? (adminUsers.find(u => u.id === employee.linked_user_id)?.name ?? `User #${employee.linked_user_id}`)
                      : 'Own email only'}
                  </span>
                </div>
                {employee.agreement_url && (
                  <a href={employee.agreement_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1.5 mt-3 pt-2 hover:opacity-80"
                    style={{ color: 'var(--accent)', borderTop: '1px solid var(--border)' }}>
                    <FileText size={12} /> View Employment Agreement
                  </a>
                )}
                {employee.notes && <p className="text-xs mt-3 pt-2" style={{ color: 'var(--text-muted)', borderTop: employee.agreement_url ? 'none' : '1px solid var(--border)' }}>{employee.notes}</p>}
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
                  <div className="flex items-center justify-between text-sm mb-2 gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>Variable Pay</span>
                    <input
                      type="number" placeholder="0" defaultValue={variablePayItem?.amount || ''} key={variablePayItem?.amount ?? 'empty'}
                      onBlur={e => {
                        const v = Number(e.target.value) || 0;
                        if (v !== (variablePayItem?.amount ?? 0)) setVariablePay(v);
                      }}
                      className="input text-sm w-24 text-right"
                    />
                  </div>
                  {cp.bonusItems.filter((b: any) => b.description !== 'Variable Pay').map((b: any) => (
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
                    <input placeholder="Other bonus description" value={bonusDesc} onChange={e => setBonusDesc(e.target.value)} className="input text-sm flex-1 min-w-0" />
                    <input type="number" placeholder="$" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} className="input text-sm w-20" />
                    <button onClick={addBonus} className="btn-ghost text-xs px-3 shrink-0"><Plus size={13} /></button>
                  </div>

                  {cp.status === 'paid' && cp.paymentRecords?.[0] && (
                    <div className="text-xs p-2.5 rounded-lg mt-3 space-y-0.5" style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--text-muted)' }}>
                      <p>
                        <span style={{ color: 'var(--green)' }}>Paid</span> via {methodLabel(cp.paymentRecords[0].method)} on {fmtDate(cp.paymentRecords[0].paid_at.slice(0, 10))}
                        {cp.paymentRecords[0].reference && ` · ref: ${cp.paymentRecords[0].reference}`}
                      </p>
                      <p>recorded by {cp.paymentRecords[0].recorded_by}</p>
                      {cp.paymentRecords[0].notes && <p>{cp.paymentRecords[0].notes}</p>}
                    </div>
                  )}

                  <div className="mt-3">
                    {cp.status === 'pending' ? (
                      <button onClick={() => setShowRecordPayment(true)} className="btn-primary text-sm w-full">Record Payment</button>
                    ) : (
                      <button onClick={() => undoPaid(cp.id)} className="btn-ghost text-sm w-full">Undo — Mark as Pending</button>
                    )}
                  </div>
                </div>
              )}

              {(employee.client_onboard_launch_bonus > 0 || employee.client_management_monthly_fee > 0 || employee.per_client_fee > 0) && (
                <ClientManagementSection
                  employee={employee}
                  tracking={detail.clientTracking ?? []}
                  onChange={() => { loadDetail(); onChange(); }}
                />
              )}

              {detail.periods.length > 1 && (
                <div className="card-2 overflow-hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide px-4 pt-3 pb-2" style={{ color: 'var(--text-muted)' }}>History</p>
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {detail.periods.slice(1).map((p: any) => (
                      <div key={p.id} className="px-4 py-2 flex items-center justify-between text-sm">
                        <div>
                          <p>{fmtDate(p.payout_date)}</p>
                          {p.paymentRecords?.[0] && (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>via {methodLabel(p.paymentRecords[0].method)}</p>
                          )}
                        </div>
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

      {showRecordPayment && cp && (
        <RecordPaymentModal
          period={cp}
          defaultMethod={employee.payment_method ?? 'bank_transfer'}
          onClose={() => setShowRecordPayment(false)}
          onSaved={() => { setShowRecordPayment(false); loadDetail(); onChange(); }}
        />
      )}
    </div>
  );
}

// ── Client Management ────────────────────────────────────────────────────────
// Which real clients this employee handles, and what that earns them — picked
// from the same client roster the rest of the app uses, not a freeform list.
// The dollar totals shown here are read straight back from the real bonus
// line items the server already generated (see lib/clientManagement.ts) —
// this is a view onto real pay, not a separate estimate that could drift.
// Two modes, decided by which rate fields are actually set on the employee
// (never by name — see lib/clientManagement.ts's own note on this):
//   • CSM mode (client_onboard_launch_bonus / client_management_monthly_fee)
//     — one launch date per client drives a $100 bonus + recurring $150/mo.
//   • Flat per-account mode (per_client_fee only) — just a running count of
//     accounts, no dates; each one is a flat one-time fee.
function ClientManagementSection({ employee, tracking, onChange }: {
  employee: any; tracking: any[]; onChange: () => void;
}) {
  const employeeId = employee.id;
  const isCsmMode = employee.client_onboard_launch_bonus > 0 || employee.client_management_monthly_fee > 0;

  const [showAdd, setShowAdd] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setShowAdd(true);
    if (clients.length === 0) {
      setLoadingClients(true);
      fetch('/api/clients').then(r => r.json()).then(d => { setClients(Array.isArray(d) ? d : []); setLoadingClients(false); });
    }
  };

  const trackedClientIds = new Set(tracking.map(t => t.clientId));
  const availableClients = clients.filter(c => !trackedClientIds.has(c.id));

  const addClient = async () => {
    if (!selectedClientId) return;
    setSaving(true);
    await fetch(`/api/admin/payroll/employees/${employeeId}/client-tracking`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: Number(selectedClientId) }),
    });
    setSelectedClientId('');
    setShowAdd(false);
    setSaving(false);
    onChange();
  };

  const updateTracking = async (trackingId: number, updates: any) => {
    await fetch(`/api/admin/payroll/employees/${employeeId}/client-tracking?trackingId=${trackingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    onChange();
  };

  const removeTracking = async (trackingId: number) => {
    await fetch(`/api/admin/payroll/employees/${employeeId}/client-tracking?trackingId=${trackingId}`, { method: 'DELETE' });
    onChange();
  };

  const total = tracking.reduce((s, t) => s + t.totalEarned, 0);
  const title = isCsmMode ? 'Client Management' : 'Accounts';
  const addLabel = isCsmMode ? 'Add Client' : 'Add Account';
  const emptyLabel = isCsmMode
    ? 'No clients tracked yet — add one to start logging the launch date.'
    : 'No accounts logged yet — add one for each account done.';
  const totalLabel = isCsmMode ? 'Total — Client Management' : `Total — ${tracking.length} account${tracking.length === 1 ? '' : 's'} × ${fmt$(employee.per_client_fee)}`;

  return (
    <div className="card-2 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <Rocket size={12} /> {title}
        </p>
        <button onClick={openAdd} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} /> {addLabel}</button>
      </div>

      {showAdd && (
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {loadingClients ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading clients…</p>
          ) : (
            <>
              <select className="input text-sm flex-1 min-w-0" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                <option value="">Select client…</option>
                {availableClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={addClient} disabled={saving || !selectedClientId} className="btn-primary text-xs px-3 shrink-0">Add</button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs px-2 shrink-0">Cancel</button>
            </>
          )}
        </div>
      )}

      {tracking.length === 0 ? (
        <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>{emptyLabel}</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {tracking.map(t => (
            isCsmMode ? (
              <ClientTrackingRow
                key={t.id} tracking={t}
                onUpdate={updates => updateTracking(t.id, updates)}
                onRemove={() => removeTracking(t.id)}
              />
            ) : (
              <SimpleAccountRow key={t.id} tracking={t} onRemove={() => removeTracking(t.id)} />
            )
          ))}
        </div>
      )}

      {tracking.length > 0 && (
        <div className="px-4 py-2.5 flex items-center justify-between text-sm font-bold" style={{ borderTop: '1px solid var(--border)' }}>
          <span>{totalLabel}</span>
          <span>{fmt$(total)}</span>
        </div>
      )}
    </div>
  );
}

// Flat per-account mode (e.g. Bolu) — just a count of accounts done and the
// flat fee each one earned. No dates, no active toggle — "did this account"
// is a permanent record, not an ongoing management state to track.
function SimpleAccountRow({ tracking, onRemove }: { tracking: any; onRemove: () => void }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between text-sm">
      <span className="truncate">{tracking.clientName}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold" style={{ color: 'var(--green)' }}>{fmt$(tracking.totalEarned)}</span>
        <button onClick={onRemove} className="opacity-50 hover:opacity-100"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function ClientTrackingRow({ tracking, onUpdate, onRemove }: {
  tracking: any; onUpdate: (updates: any) => void; onRemove: () => void;
}) {
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-medium truncate">{tracking.clientName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold" style={{ color: 'var(--green)' }}>{fmt$(tracking.totalEarned)}</span>
          <button onClick={onRemove} className="opacity-50 hover:opacity-100"><Trash2 size={12} /></button>
        </div>
      </div>
      <div className="flex items-end gap-3 mb-2">
        <div className="shrink-0">
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Launch date</label>
          <input
            type="date" className="input text-xs" defaultValue={tracking.launchedAt ?? ''}
            key={tracking.launchedAt ?? 'empty-launched'}
            onBlur={e => { if (e.target.value !== (tracking.launchedAt ?? '')) onUpdate({ launchedAt: e.target.value || null }); }}
          />
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs pb-2" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={tracking.active} onChange={e => onUpdate({ active: e.target.checked })} />
          Actively managing
        </label>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {tracking.launchedAt
          ? tracking.onboardLaunchBonusEarned
            ? `✓ Onboard + launch bonus paid${tracking.managementPaymentsCharged > 0 ? ` · ${tracking.managementPaymentsCharged} monthly fee${tracking.managementPaymentsCharged > 1 ? 's' : ''} so far` : ''}`
            : 'Bonus queued for the next paycheck'
          : 'Set the launch date to start the $100 bonus + monthly fee'}
        {tracking.launchedAt && tracking.active && tracking.nextPaymentDate &&
          ` · next fee ${fmtDate(tracking.nextPaymentDate)}`}
      </p>
    </div>
  );
}

function RecordPaymentModal({ period, defaultMethod, onClose, onSaved }: {
  period: any; defaultMethod: string; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(period.totalAmount));
  const [method, setMethod] = useState(defaultMethod);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/admin/payroll/periods/${period.id}/mark-paid`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), method, reference, notes, paidAt }),
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Record Payment</h3>
        <div className="space-y-3">
          <Field label="Amount ($)"><input type="number" className="input w-full text-sm" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
          <Field label="Method">
            <select className="input w-full text-sm" value={method} onChange={e => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Date Paid"><input type="date" className="input w-full text-sm" value={paidAt} onChange={e => setPaidAt(e.target.value)} /></Field>
          <Field label="Reference (optional)"><input className="input w-full text-sm" placeholder="Confirmation #, transfer ID, etc." value={reference} onChange={e => setReference(e.target.value)} /></Field>
          <Field label="Notes (optional)"><textarea className="input w-full text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Record Payment'}</button>
        </div>
      </div>
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

function AddEmployeeModal({ assignableOptions, onClose, onSaved }: { assignableOptions: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', role: '', email: '', baseAmountPerPeriod: '', paymentMethod: 'bank_transfer', assignedTo: '' });
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
          <select className="input w-full text-sm" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select className="input w-full text-sm" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
            <option value="">Assigned to… (optional)</option>
            {assignableOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
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

export default function AdminPayrollPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const [employees, setEmployees] = useState<any[]>([]);
  const [nextPayoutDate, setNextPayoutDate] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    fetch('/api/admin/payroll/employees').then(r => r.json()).then(d => {
      setEmployees(d.employees ?? []);
      setNextPayoutDate(d.nextPayoutDate ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role === 'employee') { router.push('/employee'); return; }
    if (status === 'authenticated' && (user?.role !== 'admin' || !user?.canViewFinancials)) router.push('/admin/home');
  }, [status, user, router]);

  useEffect(() => {
    if (status === 'authenticated' && user?.role === 'admin' && user?.canViewFinancials) {
      load();
      fetch('/api/users').then(r => r.json()).then(users => {
        setAdminUsers((Array.isArray(users) ? users : []).filter((u: any) => u.role === 'admin'));
      });
    }
  }, [status, user, load]);

  const countdown = useCountdown(nextPayoutDate);

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
  // Assignment picker sources admin accounts only (from /api/users) — an
  // employee card is "assigned to" whichever admin owns/manages that
  // relationship, not to another payroll employee.
  const assignableOptions = Array.from(new Set(adminUsers.map(u => u.name))).sort();

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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
          <div className="card px-4 py-4">
            <p className="text-xs mb-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Timer size={11} /> Next Payout</p>
            <p className="font-bold text-xl" style={{ color: 'var(--green)' }}>{countdown ?? '—'}</p>
            {nextPayoutDate && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtDate(nextPayoutDate)}</p>}
          </div>
        </div>

        <div className="space-y-2">
          {employees.map(e => <EmployeeCard key={e.id} employee={e} assignableOptions={assignableOptions} adminUsers={adminUsers} onChange={load} />)}
        </div>
      </div>

      {showAdd && <AddEmployeeModal assignableOptions={assignableOptions} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

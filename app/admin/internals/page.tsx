'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, BookUser, FileText, Pencil, Check, X, Calendar, ExternalLink,
  Users, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';

function fmt$(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Live-ish countdown to a payout date — recomputes every minute.
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
      className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit shrink-0"
      style={{ background: paid ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: paid ? 'var(--green)' : 'var(--yellow)' }}
    >
      {paid ? <CheckCircle2 size={10} /> : <Clock size={10} />}
      {paid ? 'Paid' : 'Pending'}
    </span>
  );
}

// Click-to-edit text field — the Internals Hub owns role/responsibilities/
// contract-link editing directly (there's nowhere else for a plain "what
// does this person do" field to live); pay structure and mechanics stay
// exclusively editable in Payroll so there's still one place for that.
function InlineEdit({ value, placeholder, multiline, onSave }: {
  value: string; placeholder: string; multiline?: boolean; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <div className="space-y-1.5">
        <Tag
          className="input text-sm w-full"
          rows={multiline ? 3 : undefined}
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (!multiline && e.key === 'Enter') { onSave(draft); setEditing(false); }
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
        />
        <div className="flex justify-end gap-1.5">
          <button onClick={() => { setDraft(value); setEditing(false); }} className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"><X size={11} /> Cancel</button>
          <button onClick={() => { onSave(draft); setEditing(false); }} className="btn-primary text-xs px-2 py-1 flex items-center gap-1"><Check size={11} /> Save</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => { setDraft(value); setEditing(true); }} className="text-left w-full group/edit flex items-start gap-1.5">
      <span className={`text-sm flex-1 ${value ? '' : 'italic'}`} style={{ color: value ? 'var(--text)' : 'var(--text-muted)', whiteSpace: multiline ? 'pre-wrap' : 'nowrap' }}>
        {value || placeholder}
      </span>
      <Pencil size={11} className="opacity-0 group-hover/edit:opacity-50 shrink-0 mt-0.5" />
    </button>
  );
}

function EmployeeHub({ employee, nextPayoutDate, onChange }: { employee: any; nextPayoutDate: string; onChange: () => void }) {
  const cp = employee.currentPeriod;
  const tracking = employee.clientTracking ?? [];
  const inactive = !employee.active;
  const countdown = useCountdown(cp?.status === 'pending' ? cp.payout_date : null);

  const patch = async (updates: any) => {
    await fetch(`/api/admin/payroll/employees/${employee.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    onChange();
  };

  return (
    <div className="card overflow-hidden" style={{ opacity: inactive ? 0.6 : 1 }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0" style={{ background: 'var(--accent)', color: '#fff' }}>
            {employee.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{employee.name} {inactive && <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(inactive)</span>}</p>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <InlineEdit value={employee.role} placeholder="Add a role/title…" onSave={v => patch({ role: v })} />
            </div>
          </div>
        </div>
        {cp && <StatusPill status={cp.status} />}
      </div>

      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <BookUser size={12} /> Responsibilities
          </p>
          <InlineEdit
            value={employee.responsibilities ?? ''} multiline
            placeholder="Click to add what this person actually does…"
            onSave={v => patch({ responsibilities: v })}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <FileText size={12} /> Contract
          </p>
          {employee.agreement_url ? (
            <div className="flex items-center justify-between gap-2">
              <a href={employee.agreement_url} target="_blank" rel="noopener noreferrer"
                className="text-sm flex items-center gap-1.5 hover:opacity-80" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={12} /> View signed agreement
              </a>
              <button onClick={() => { const v = prompt('Contract URL', employee.agreement_url); if (v != null) patch({ agreementUrl: v }); }} className="opacity-40 hover:opacity-100"><Pencil size={11} /></button>
            </div>
          ) : (
            <button
              onClick={() => { const v = prompt('Contract URL (Drive, Dropbox, etc.)'); if (v) patch({ agreementUrl: v }); }}
              className="text-xs flex items-center gap-1.5" style={{ color: 'var(--yellow)' }}
            >
              <AlertTriangle size={12} /> No contract on file — click to add a link
            </button>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Calendar size={12} /> Payroll Schedule
          </p>
          <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Semi-monthly — paid the 14th &amp; 28th</p>
          {cp && (
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>
                {cp.status === 'pending' ? `Next: ${fmtDate(cp.payout_date)}${countdown ? ` (${countdown === 'Due today' ? countdown : countdown + ' left'})` : ''}` : `Last paid ${fmtDate(cp.payout_date)}`}
              </span>
              <span className="font-semibold">{fmt$(cp.totalAmount)}</span>
            </div>
          )}
          <Link href="/admin/payroll" className="text-xs flex items-center gap-1 mt-1.5 hover:opacity-80" style={{ color: 'var(--accent)' }}>
            View full payroll <ExternalLink size={10} />
          </Link>
        </div>

        {tracking.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Users size={12} /> Per-Account Clients ({tracking.length})
            </p>
            <div className="space-y-1.5">
              {tracking.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{t.clientName}</span>
                    {!t.active && <span className="px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>inactive</span>}
                  </span>
                  <span className="font-medium shrink-0" style={{ color: 'var(--green)' }}>{fmt$(t.totalEarned)}</span>
                </div>
              ))}
            </div>
            <Link href="/admin/payroll" className="text-xs flex items-center gap-1 mt-2 hover:opacity-80" style={{ color: 'var(--accent)' }}>
              Manage clients in Payroll <ExternalLink size={10} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InternalsHubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/admin/payroll/employees').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role === 'employee') { router.push('/employee'); return; }
    if (status === 'authenticated' && (user?.role !== 'admin' || !user?.canViewFinancials)) router.push('/admin/home');
  }, [status, user, router]);

  useEffect(() => {
    if (status === 'authenticated' && user?.role === 'admin' && user?.canViewFinancials) load();
  }, [status, user, load]);

  if (status !== 'authenticated' || user?.role !== 'admin' || !user?.canViewFinancials || loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const employees: any[] = data.employees ?? [];
  const active = employees.filter(e => e.active);
  const missingContracts = active.filter(e => !e.agreement_url);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10 flex-wrap gap-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          <Link href="/admin/home" className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> Home
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2"><BookUser size={16} style={{ color: 'var(--accent)' }} /> Internals Hub</span>
        </div>
        <Link href="/admin/payroll" className="btn-ghost text-sm flex items-center gap-1.5">
          <Users size={14} /> Payroll
        </Link>
      </nav>

      <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card px-4 py-4">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Team Members</p>
            <p className="font-bold text-xl" style={{ color: 'var(--accent)' }}>{active.length}</p>
          </div>
          <div className="card px-4 py-4">
            <p className="text-xs mb-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              {missingContracts.length > 0 && <AlertTriangle size={11} style={{ color: 'var(--yellow)' }} />} Missing Contracts
            </p>
            <p className="font-bold text-xl" style={{ color: missingContracts.length > 0 ? 'var(--yellow)' : 'var(--green)' }}>{missingContracts.length}</p>
          </div>
          <div className="card px-4 py-4 col-span-2 sm:col-span-1">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Next Payout</p>
            <p className="font-bold text-xl" style={{ color: 'var(--text)' }}>{fmtDate(data.nextPayoutDate)}</p>
          </div>
        </div>

        <div className="space-y-3">
          {employees.map(e => (
            <EmployeeHub key={e.id} employee={e} nextPayoutDate={data.nextPayoutDate} onChange={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Wallet, Calendar, CheckCircle2, Clock, LogOut, Info, FileText, Timer } from 'lucide-react';
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
      className="text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 w-fit"
      style={{ background: paid ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: paid ? 'var(--green)' : 'var(--yellow)' }}
    >
      {paid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
      {paid ? 'Paid' : 'Pending'}
    </span>
  );
}

export default function EmployeePayrollPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role !== 'employee') router.push('/login');
  }, [status, user, router]);

  useEffect(() => {
    if (status !== 'authenticated' || user?.role !== 'employee') return;
    fetch('/api/employee/payroll').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, [status, user]);

  // Called unconditionally (before any early return) per the Rules of Hooks
  // — optional chaining keeps it safe while `data` is still null during load.
  const countdown = useCountdown(data?.currentPeriod?.status === 'pending' ? data.currentPeriod.payout_date : null);

  if (status !== 'authenticated' || user?.role !== 'employee' || loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{data.error}</p>
      </div>
    );
  }

  const { employee, currentPeriod, history } = data;
  const ps = employee.payStructure;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-4 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1.5 shrink-0" style={{ background: 'var(--accent)' }}>
            <img src="/logo-icon.png" alt="Merova Media" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{employee.name}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{employee.role}</p>
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="btn-ghost text-xs flex items-center gap-1.5 shrink-0">
          <LogOut size={13} /> Sign Out
        </button>
      </nav>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Current period */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Wallet size={14} style={{ color: 'var(--accent)' }} /> Current Pay Period</h2>
            {currentPeriod && <StatusPill status={currentPeriod.status} />}
          </div>
          {currentPeriod ? (
            <>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                {fmtDate(currentPeriod.period_start)} – {fmtDate(currentPeriod.period_end)} · paid {fmtDate(currentPeriod.payout_date)}
              </p>
              <div className="text-center py-3 mb-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                <p className="text-3xl font-bold" style={{ color: 'var(--green)' }}>{fmt$(currentPeriod.totalAmount)}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>total this period</p>
                {countdown && (
                  <p className="text-xs mt-2 flex items-center justify-center gap-1" style={{ color: 'var(--accent)' }}>
                    <Timer size={11} /> {countdown === 'Due today' ? countdown : `${countdown} until payout`}
                  </p>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Base</span>
                  <span className="font-medium">{fmt$(currentPeriod.base_amount)}</span>
                </div>
                {currentPeriod.bonusItems.length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No bonuses logged this period.</p>
                ) : (
                  currentPeriod.bonusItems.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="truncate">{b.description}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>added {fmtDate(b.added_at.slice(0, 10))}</p>
                      </div>
                      <span className="font-medium shrink-0" style={{ color: 'var(--green)' }}>+{fmt$(b.amount)}</span>
                    </div>
                  ))
                )}
              </div>
              {currentPeriod.status === 'paid' && currentPeriod.paymentRecords?.[0] && (
                <p className="text-xs mt-3 pt-3" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  Paid via {methodLabel(currentPeriod.paymentRecords[0].method)} on {fmtDate(currentPeriod.paymentRecords[0].paid_at.slice(0, 10))}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No period found yet.</p>
          )}
        </div>

        {/* Payment history */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <Calendar size={14} />
            <p className="font-semibold text-sm">Payment History</p>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No past periods yet.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {history.map((p: any) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{fmtDate(p.payout_date)}</p>
                    {p.bonusItems.length > 0 && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.bonusItems.length} bonus{p.bonusItems.length > 1 ? 'es' : ''} included</p>
                    )}
                    {p.paymentRecords?.[0] && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>via {methodLabel(p.paymentRecords[0].method)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={p.status} />
                    <span className="font-semibold w-16 text-right">{fmt$(p.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pay structure summary */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Info size={14} style={{ color: 'var(--accent)' }} /> How Your Pay Is Calculated</h2>
            {employee.agreementUrl && (
              <a href={employee.agreementUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--accent)' }}>
                <FileText size={12} /> Agreement
              </a>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Base per period</span>
              <span className="font-medium">{fmt$(ps.baseAmountPerPeriod)}</span>
            </div>
            {ps.perClientFee > 0 && (
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Per-client fee</span>
                <span className="font-medium">{fmt$(ps.perClientFee)}</span>
              </div>
            )}
            {ps.revenueSharePct > 0 && (
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Revenue share</span>
                <span className="font-medium">{ps.revenueSharePct}%</span>
              </div>
            )}
            {ps.hourlyBonusRate > 0 && (
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Hourly bonus rate</span>
                <span className="font-medium">{fmt$(ps.hourlyBonusRate)}/hr past {ps.hourlyBonusThresholdMinutes}min</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Payment method</span>
              <span className="font-medium">{methodLabel(ps.paymentMethod)}</span>
            </div>
          </div>
          {ps.notes && (
            <p className="text-xs mt-4 pt-3" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>{ps.notes}</p>
          )}
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            Variable pay (revenue share, per-client fees, hourly bonuses) shows up as a bonus line item in the period it's earned, not folded into the base above.
          </p>
        </div>
      </div>
    </div>
  );
}

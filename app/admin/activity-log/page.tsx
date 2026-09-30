'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Plus, Clock, CheckCircle2 } from 'lucide-react';

interface TodayLog {
  id: number;
  status: 'draft' | 'submitted';
  client_count: number;
}
interface HistoryLog {
  id: number;
  log_date: string;
  day_of_week: string;
  media_buyer_name: string;
  submitted_at: string;
  client_count: number;
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
function fmtTime(dateTimeStr: string): string {
  // SQLite datetime('now') is UTC with no 'Z' suffix — tell the Date parser so
  // it doesn't get read as local time.
  return new Date(dateTimeStr.endsWith('Z') ? dateTimeStr : `${dateTimeStr}Z`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityLogHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;

  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<TodayLog | null>(null);
  const [nextLogDue, setNextLogDue] = useState('');
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && !user?.employeeId && user?.role !== 'admin') router.push('/dashboard');
  }, [status, user, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/activity-log').then((r) => r.json()).then((data) => {
      setToday(data.today);
      setNextLogDue(data.nextLogDue);
      setHistory(data.history);
      setLoading(false);
    });
  }, [status]);

  async function createLog() {
    setCreating(true);
    const res = await fetch('/api/activity-log', { method: 'POST' });
    const data = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/admin/activity-log/${data.id}`);
  }

  if (status !== 'authenticated' || (!user?.employeeId && user?.role !== 'admin') || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const statusLabel = !today ? 'Not Started' : today.status === 'submitted' ? 'Submitted' : 'In Progress';
  const statusColor = !today ? 'var(--text-muted)' : today.status === 'submitted' ? 'var(--green)' : 'var(--yellow)';

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <Link href="/admin/home" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Home
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="font-semibold flex items-center gap-2"><ClipboardList size={16} /> Media Buyer Activity Log</span>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="card p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Next Log Due</p>
            <p className="text-lg font-bold">{nextLogDue}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Today's Log</p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold" style={{ background: `${statusColor}18`, color: statusColor }}>
              {today?.status === 'submitted' ? <CheckCircle2 size={13} /> : <Clock size={13} />} {statusLabel}
            </span>
          </div>
        </div>

        {today ? (
          <Link href={`/admin/activity-log/${today.id}`} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
            {today.status === 'submitted' ? 'View Today\'s Log' : 'Continue Today\'s Log'} ({today.client_count} client{today.client_count === 1 ? '' : 's'})
          </Link>
        ) : (
          <button onClick={createLog} disabled={creating} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
            <Plus size={18} /> {creating ? 'Creating…' : 'Create Activity Log'}
          </button>
        )}

        <div className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Previous Logs</h2>
          {history.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No submitted logs yet.</p>
          )}
          {history.map((h) => (
            <Link key={h.id} href={`/admin/activity-log/${h.id}`} className="card p-4 flex items-center justify-between hover:border-[var(--accent)] transition-colors">
              <div>
                <p className="font-semibold">{h.day_of_week}, {fmtDate(h.log_date)}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Submitted {fmtTime(h.submitted_at)} · {h.client_count} Client{h.client_count === 1 ? '' : 's'} Reviewed · {h.media_buyer_name}
                </p>
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>View Log →</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

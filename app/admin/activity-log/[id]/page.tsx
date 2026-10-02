'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Search, X, Lock, LockOpen, Check, ChevronDown, ChevronUp,
  Trash2, AlertTriangle, CheckCircle2, Circle, SkipForward,
} from 'lucide-react';
import { ACTION_TYPES, CAMPAIGN_HEALTH_CONFIG, CampaignHealth } from '@/lib/activityLog';

interface Snapshot {
  window_days: number; spend: number; leads: number; cpl: number | null;
  appointments: number; cost_per_appointment: number | null; booking_rate: number | null;
  ctr: number | null; cpc: number | null; cpm: number | null; frequency: number | null;
}
interface ActionRow {
  id: number; action_type: string; action_taken: string;
  reason: string | null; expected_result: string | null; follow_up_date: string | null;
  created_at: string;
}
interface ClientReview {
  id: number; client_id: number | null; client_name: string;
  review_status: 'in_progress' | 'locked' | 'skipped';
  campaign_health: CampaignHealth | null;
  observation: string | null; skip_reason: string | null;
  snapshot_taken_at: string | null; locked_at: string | null;
  snapshots: Snapshot[]; actions: ActionRow[];
}
interface LogDetail {
  id: number; media_buyer_name: string; log_date: string; day_of_week: string;
  status: 'draft' | 'submitted'; started_at: string; submitted_at: string | null;
  overall_performance: string | null; biggest_priorities: string | null; creative_testing_plan: string | null;
}

function fmt$(n: number | null): string {
  if (n == null) return '—';
  return `$${n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(n < 10 ? 2 : 0)}`;
}
function fmtPct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}
function fmtTime(dateTimeStr: string | null): string {
  if (!dateTimeStr) return '';
  return new Date(dateTimeStr.endsWith('Z') ? dateTimeStr : `${dateTimeStr}Z`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const METRIC_ROWS: { key: keyof Snapshot; label: string; fmt: (v: number | null) => string }[] = [
  { key: 'spend', label: 'Spend', fmt: fmt$ },
  { key: 'leads', label: 'Leads', fmt: (v) => v == null ? '—' : String(v) },
  { key: 'cpl', label: 'CPL', fmt: fmt$ },
  { key: 'appointments', label: 'Appointments', fmt: (v) => v == null ? '—' : String(v) },
  { key: 'cost_per_appointment', label: 'Cost / Appt', fmt: fmt$ },
  { key: 'booking_rate', label: 'Booking Rate', fmt: fmtPct },
];
const META_ROWS: { key: keyof Snapshot; label: string; fmt: (v: number | null) => string }[] = [
  { key: 'ctr', label: 'CTR', fmt: (v) => v == null ? '—' : `${v.toFixed(2)}%` },
  { key: 'cpc', label: 'CPC', fmt: fmt$ },
  { key: 'cpm', label: 'CPM', fmt: fmt$ },
  { key: 'frequency', label: 'Frequency', fmt: (v) => v == null ? '—' : v.toFixed(2) },
];

export default function ActivityLogDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const logId = params.id as string;
  const user = session?.user as any;

  const [log, setLog] = useState<LogDetail | null>(null);
  const [clients, setClients] = useState<ClientReview[]>([]);
  const [eligibleClients, setEligibleClients] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [submitError, setSubmitError] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockingAll, setLockingAll] = useState(false);
  const [lockAllResult, setLockAllResult] = useState<{ lockedCount: number; skipped: { name: string; missing: string[] }[] } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && !user?.employeeId && user?.role !== 'admin') router.push('/dashboard');
  }, [status, user, router]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/activity-log/${logId}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setLog(data.log);
    setClients(data.clients);
    setEligibleClients(data.eligibleClients);
    setLoading(false);
  }, [logId]);

  useEffect(() => { if (status === 'authenticated') load(); }, [status, load]);

  if (status !== 'authenticated' || (!user?.employeeId && user?.role !== 'admin') || loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;
  }
  if (!log) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Log not found.</p></div>;
  }

  const readOnly = log.status === 'submitted';
  const doneCount = clients.filter((c) => c.review_status === 'locked' || c.review_status === 'skipped').length;
  const lockableCount = clients.filter((c) => c.review_status === 'in_progress').length;

  async function addClient(clientId: number) {
    const res = await fetch(`/api/activity-log/${logId}/clients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }),
    });
    if (res.ok) { setShowPicker(false); await load(); setExpandedId((await res.json()).id ?? null); }
  }

  async function reviewAll() {
    setAddingAll(true);
    await fetch(`/api/activity-log/${logId}/clients/review-all`, { method: 'POST' });
    await load();
    setAddingAll(false);
  }

  async function lockAll() {
    setLockingAll(true);
    setLockAllResult(null);
    const res = await fetch(`/api/activity-log/${logId}/lock-all`, { method: 'POST' });
    const data = await res.json();
    setLockingAll(false);
    if (res.ok) setLockAllResult(data);
    await load();
  }

  async function submitLog() {
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetch(`/api/activity-log/${logId}/submit`, { method: 'POST' });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setSubmitError(data.missing ?? [data.error]); return; }
    await load();
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <Link href="/admin/activity-log" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Activity Log
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="card p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Media Buyer Activity Log</p>
              <h1 className="text-2xl font-bold mt-1">{fmtDate(log.log_date)}</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Media Buyer: <strong style={{ color: 'var(--text)' }}>{log.media_buyer_name}</strong> · Started {fmtTime(log.started_at)}
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold" style={{
              background: readOnly ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
              color: readOnly ? 'var(--green)' : 'var(--yellow)',
            }}>
              {readOnly ? 'Submitted' : 'Draft'}
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Client Reviews</h2>
            <div className="flex items-center gap-3">
              <span className="font-bold">{doneCount} / {clients.length} Completed</span>
              {!readOnly && lockableCount > 0 && (
                <button onClick={lockAll} disabled={lockingAll} className="btn-ghost text-xs flex items-center gap-1.5 py-1 px-2">
                  <Lock size={12} /> {lockingAll ? 'Locking…' : `Lock All (${lockableCount})`}
                </button>
              )}
            </div>
          </div>
          {lockAllResult && (
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Locked {lockAllResult.lockedCount}.
              {lockAllResult.skipped.length > 0 && ` Still need attention: ${lockAllResult.skipped.map((s) => `${s.name} (${s.missing.join(', ')})`).join('; ')}.`}
            </p>
          )}
          {clients.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No clients added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clients.map((c) => {
                const done = c.review_status === 'locked' || c.review_status === 'skipped';
                return (
                  <button key={c.id} onClick={() => setExpandedId(c.id)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
                    style={{ background: done ? 'rgba(34,197,94,0.12)' : 'var(--surface-2)', color: done ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {done ? <CheckCircle2 size={11} /> : <Circle size={11} />} {c.client_name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Add clients */}
        {!readOnly && (
          <div className="flex gap-3">
            <button onClick={() => setShowPicker(true)} className="btn-ghost flex-1 flex items-center justify-center gap-2">
              <Plus size={15} /> Add Client
            </button>
            <button onClick={reviewAll} disabled={addingAll || eligibleClients.length === 0} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {addingAll ? 'Adding…' : `Review All Active Clients${eligibleClients.length ? ` (${eligibleClients.length})` : ''}`}
            </button>
          </div>
        )}

        {/* Client cards */}
        <div className="space-y-3">
          {clients.map((c) => (
            <ClientCard key={c.id} review={c} expanded={expandedId === c.id} readOnly={readOnly} isAdmin={user?.role === 'admin'}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onChange={load} />
          ))}
        </div>

        {/* Daily Summary */}
        <DailySummary log={log} readOnly={readOnly} onChange={load} />

        {/* Submit */}
        {!readOnly && (
          <div className="card p-5 space-y-3">
            {submitError && (
              <div className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <ul className="list-disc pl-4 space-y-0.5">{submitError.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
            <button onClick={submitLog} disabled={submitting} className="btn-primary w-full py-3 text-base">
              {submitting ? 'Submitting…' : 'Submit Activity Log'}
            </button>
          </div>
        )}
      </div>

      {showPicker && (
        <ClientPickerModal clients={eligibleClients} onClose={() => setShowPicker(false)} onSelect={addClient} />
      )}
    </div>
  );
}

// ── Add Client picker ─────────────────────────────────────────────────────────
function ClientPickerModal({ clients, onClose, onSelect }: { clients: { id: number; name: string }[]; onClose: () => void; onSelect: (id: number) => void }) {
  const [q, setQ] = useState('');
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-md p-5 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Add Client</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input autoFocus className="input pl-9" placeholder="Search active clients…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No matching clients.</p>}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--surface-2)] text-sm font-medium">
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── One client's review card ──────────────────────────────────────────────────
function ClientCard({ review, expanded, readOnly, isAdmin, onToggle, onChange }: {
  review: ClientReview; expanded: boolean; readOnly: boolean; isAdmin: boolean;
  onToggle: () => void; onChange: () => Promise<void>;
}) {
  const [health, setHealth] = useState<CampaignHealth | null>(review.campaign_health);
  const [observation, setObservation] = useState(review.observation ?? '');
  const [saving, setSaving] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [confirmLock, setConfirmLock] = useState(false);

  const locked = review.review_status === 'locked';
  const skipped = review.review_status === 'skipped';
  const canEdit = !readOnly && !locked && !skipped;

  async function saveField(patch: any) {
    setSaving(true);
    await fetch(`/api/activity-log/clients/${review.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    setSaving(false);
    onChange();
  }

  async function doSkip() {
    if (!skipReason.trim()) return;
    await fetch(`/api/activity-log/clients/${review.id}/skip`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: skipReason }),
    });
    setShowSkip(false);
    onChange();
  }

  async function doLock() {
    const res = await fetch(`/api/activity-log/clients/${review.id}/lock`, { method: 'POST' });
    const data = await res.json();
    setConfirmLock(false);
    if (!res.ok) { alert(data.error); return; }
    onChange();
  }

  async function doUnlock() {
    const reason = window.prompt('Reason for unlocking? (recorded in the audit trail)') ?? '';
    await fetch(`/api/activity-log/clients/${review.id}/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    onChange();
  }

  async function removeReview() {
    if (!window.confirm(`Remove ${review.client_name} from this log?`)) return;
    await fetch(`/api/activity-log/clients/${review.id}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-[var(--surface-2)] transition-colors">
        <div className="flex items-center gap-3">
          <span className="font-semibold">{review.client_name}</span>
          {review.campaign_health && (
            <span className="text-sm">{CAMPAIGN_HEALTH_CONFIG[review.campaign_health].emoji} {CAMPAIGN_HEALTH_CONFIG[review.campaign_health].label}</span>
          )}
          {locked && (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--green)' }}>
              <Check size={12} /> Reviewed &amp; Locked · {fmtTime(review.locked_at)}
            </span>
          )}
          {skipped && (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              <SkipForward size={12} /> Skipped — {review.skip_reason}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && !skipped && (
        <div className="border-t p-5 space-y-5" style={{ borderColor: 'var(--border)' }}>
          {/* Snapshot table */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Campaign Performance</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className="text-left py-1 pr-3 font-medium"></th>
                    {[3, 7, 30].map((w) => <th key={w} className="text-right py-1 px-3 font-semibold">{w} Day</th>)}
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map((row) => (
                    <tr key={row.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-1.5 pr-3" style={{ color: 'var(--text-muted)' }}>{row.label}</td>
                      {[3, 7, 30].map((w) => {
                        const snap = review.snapshots.find((s) => s.window_days === w);
                        return <td key={w} className="text-right py-1.5 px-3 font-semibold">{row.fmt(snap ? (snap[row.key] as number | null) : null)}</td>;
                      })}
                    </tr>
                  ))}
                  {review.snapshots.some((s) => s.ctr != null || s.cpc != null || s.cpm != null || s.frequency != null) && META_ROWS.map((row) => (
                    <tr key={row.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-1.5 pr-3 text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</td>
                      {[3, 7, 30].map((w) => {
                        const snap = review.snapshots.find((s) => s.window_days === w);
                        return <td key={w} className="text-right py-1.5 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{row.fmt(snap ? (snap[row.key] as number | null) : null)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Snapshot Taken: {fmtTime(review.snapshot_taken_at)} — permanent, never recalculated</p>
          </div>

          {/* Campaign Health */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Campaign Health</p>
            <div className="flex gap-2">
              {(Object.keys(CAMPAIGN_HEALTH_CONFIG) as CampaignHealth[]).map((h) => (
                <button key={h} disabled={!canEdit}
                  onClick={() => { setHealth(h); saveField({ campaignHealth: h }); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={{
                    borderColor: health === h ? CAMPAIGN_HEALTH_CONFIG[h].color : 'var(--border)',
                    background: health === h ? `${CAMPAIGN_HEALTH_CONFIG[h].color}18` : 'transparent',
                    color: health === h ? CAMPAIGN_HEALTH_CONFIG[h].color : 'var(--text-muted)',
                  }}>
                  {CAMPAIGN_HEALTH_CONFIG[h].emoji} {CAMPAIGN_HEALTH_CONFIG[h].label}
                </button>
              ))}
            </div>
          </div>

          {/* What I'm Seeing */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>What I'm Seeing</p>
            <textarea className="input min-h-[90px]" disabled={!canEdit} value={observation}
              onChange={(e) => setObservation(e.target.value)}
              onBlur={() => saveField({ observation })}
              placeholder="Explain what you're seeing in the data. What is working? What isn't? Any changes in CPL, lead volume, appointment volume, creative performance, etc.?" />
          </div>

          {/* What I'm Doing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>What I'm Doing</p>
              {canEdit && (
                <button onClick={() => setShowActionForm(true)} className="btn-ghost text-xs flex items-center gap-1 py-1 px-2">
                  <Plus size={12} /> Add Action
                </button>
              )}
            </div>
            <div className="space-y-2">
              {review.actions.map((a) => (
                <div key={a.id} className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,155,110,0.12)', color: 'var(--accent)' }}>{a.action_type}</span>
                    {canEdit && (
                      <button onClick={async () => { await fetch(`/api/activity-log/clients/${review.id}/actions/${a.id}`, { method: 'DELETE' }); onChange(); }}>
                        <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    )}
                  </div>
                  <p>{a.action_taken}</p>
                  {a.reason && <p style={{ color: 'var(--text-muted)' }}><strong>Why:</strong> {a.reason}</p>}
                  {a.expected_result && <p style={{ color: 'var(--text-muted)' }}><strong>Expected:</strong> {a.expected_result}</p>}
                  {a.follow_up_date && <p style={{ color: 'var(--text-muted)' }}><strong>Follow-up:</strong> {a.follow_up_date}</p>}
                </div>
              ))}
              {review.actions.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No actions recorded yet.</p>}
            </div>
            {showActionForm && (
              <ActionForm reviewId={review.id} onDone={() => { setShowActionForm(false); onChange(); }} onCancel={() => setShowActionForm(false)} />
            )}
          </div>

          {/* Lock / Unlock / Skip / Remove */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            {canEdit && (
              <>
                <button onClick={() => setConfirmLock(true)} className="btn-primary flex items-center gap-2 text-sm">
                  <Lock size={13} /> Lock Client Update
                </button>
                <button onClick={() => setShowSkip(true)} className="btn-ghost text-sm">Skip Instead</button>
                <button onClick={removeReview} className="btn-ghost text-sm ml-auto" style={{ color: 'var(--red)' }}>Remove</button>
              </>
            )}
            {locked && isAdmin && !readOnly && (
              <button onClick={doUnlock} className="btn-ghost text-sm flex items-center gap-1.5" style={{ color: 'var(--yellow)' }}>
                <LockOpen size={13} /> Unlock
              </button>
            )}
            {saving && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saving…</span>}
          </div>

          {confirmLock && (
            <ConfirmDialog
              message="Are you sure? Once locked, this client's performance snapshot and activity notes cannot be edited."
              onConfirm={doLock} onCancel={() => setConfirmLock(false)} />
          )}
          {showSkip && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-medium">Reason for skipping</p>
              <select className="input" value={skipReason} onChange={(e) => setSkipReason(e.target.value)}>
                <option value="">— select —</option>
                <option>Campaign paused</option>
                <option>Client onboarding</option>
                <option>No active ad spend</option>
                <option>Waiting for client approval</option>
                <option>Other</option>
              </select>
              <div className="flex gap-2">
                <button onClick={doSkip} disabled={!skipReason} className="btn-primary text-sm flex-1">Confirm Skip</button>
                <button onClick={() => setShowSkip(false)} className="btn-ghost text-sm flex-1">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionForm({ reviewId, onDone, onCancel }: { reviewId: number; onDone: () => void; onCancel: () => void }) {
  const [actionType, setActionType] = useState<string>(ACTION_TYPES[0]);
  const [actionTaken, setActionTaken] = useState('');
  const [reason, setReason] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    const res = await fetch(`/api/activity-log/clients/${reviewId}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType, actionTaken, reason, expectedResult, followUpDate: followUpDate || null }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    onDone();
  }

  return (
    <div className="rounded-lg p-3 mt-2 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
      <select className="input" value={actionType} onChange={(e) => setActionType(e.target.value)}>
        {ACTION_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <textarea className="input" placeholder='Action Taken — e.g. "Paused two underperforming static ads and moved budget toward the current winner."' value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} />
      <textarea className="input" placeholder='Why? — e.g. "The winning creative is generating leads at $24 CPL compared with $61+ from the other ads."' value={reason} onChange={(e) => setReason(e.target.value)} />
      <textarea className="input" placeholder='Expected Result — e.g. "Bring blended CPL back below $35."' value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
      <div>
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Follow-Up / Review Date (optional)</label>
        <input type="date" className="input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving || !actionTaken.trim()} className="btn-primary text-sm flex-1">{saving ? 'Saving…' : 'Save Action'}</button>
        <button onClick={onCancel} className="btn-ghost text-sm flex-1">Cancel</button>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card p-5 max-w-sm space-y-4">
        <p className="text-sm">{message}</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="btn-primary text-sm flex-1">Yes, Lock It</button>
          <button onClick={onCancel} className="btn-ghost text-sm flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DailySummary({ log, readOnly, onChange }: { log: LogDetail; readOnly: boolean; onChange: () => Promise<void> }) {
  const [overall, setOverall] = useState(log.overall_performance ?? '');
  const [priorities, setPriorities] = useState(log.biggest_priorities ?? '');
  const [creative, setCreative] = useState(log.creative_testing_plan ?? '');

  async function save(patch: any) {
    await fetch(`/api/activity-log/${log.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    onChange();
  }

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Daily Media Buying Summary</h2>
      <div>
        <p className="text-sm font-medium mb-1.5">Overall Performance</p>
        <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>How are accounts performing overall today?</p>
        <textarea className="input min-h-[70px]" disabled={readOnly} value={overall} onChange={(e) => setOverall(e.target.value)} onBlur={() => save({ overallPerformance: overall })} />
      </div>
      <div>
        <p className="text-sm font-medium mb-1.5">Biggest Priorities / Concerns</p>
        <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>What accounts or issues require the most attention right now?</p>
        <textarea className="input min-h-[70px]" disabled={readOnly} value={priorities} onChange={(e) => setPriorities(e.target.value)} onBlur={() => save({ biggestPriorities: priorities })} />
      </div>
      <div>
        <p className="text-sm font-medium mb-1.5">Creative / Testing Plan</p>
        <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>What new creatives, tests, or major changes are being launched next?</p>
        <textarea className="input min-h-[70px]" disabled={readOnly} value={creative} onChange={(e) => setCreative(e.target.value)} onBlur={() => save({ creativeTestingPlan: creative })} />
      </div>
    </div>
  );
}

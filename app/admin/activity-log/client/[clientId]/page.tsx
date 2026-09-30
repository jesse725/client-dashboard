'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CAMPAIGN_HEALTH_CONFIG, CampaignHealth } from '@/lib/activityLog';

interface TimelineEntry {
  id: number;
  log_date: string;
  campaign_health: CampaignHealth | null;
  observation: string | null;
  snapshots: { window_days: number; cpl: number | null; cost_per_appointment: number | null }[];
  actions: { action_type: string; action_taken: string }[];
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmt$(n: number | null): string {
  return n == null ? '—' : `$${Math.round(n)}`;
}

export default function ClientTimelinePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;
  const user = session?.user as any;

  const [clientName, setClientName] = useState('');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role !== 'admin') router.push('/dashboard');
  }, [status, user, router]);

  useEffect(() => {
    if (status !== 'authenticated' || user?.role !== 'admin') return;
    Promise.all([
      fetch(`/api/admin/activity-log/timeline/${clientId}`).then((r) => r.json()),
      fetch(`/api/clients/${clientId}`).then((r) => r.json()),
    ]).then(([tl, client]) => {
      setTimeline(tl.timeline);
      setClientName(client?.name ?? 'Client');
      setLoading(false);
    });
  }, [status, user, clientId]);

  if (status !== 'authenticated' || user?.role !== 'admin' || loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <Link href="/admin/tracker" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Client Tracker
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <h1 className="text-2xl font-bold uppercase">{clientName}</h1>
        {timeline.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No completed Activity Log reviews for this client yet.</p>
        )}
        <div className="space-y-3">
          {timeline.map((entry) => {
            const health = entry.campaign_health;
            const snap7 = entry.snapshots.find((s) => s.window_days === 7);
            return (
              <div key={entry.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold">{fmtDate(entry.log_date)}</span>
                  {health && <span style={{ color: CAMPAIGN_HEALTH_CONFIG[health].color }}>{CAMPAIGN_HEALTH_CONFIG[health].emoji} {CAMPAIGN_HEALTH_CONFIG[health].label}</span>}
                </div>
                <div className="flex gap-5 text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                  <span>CPL: <strong style={{ color: 'var(--text)' }}>{fmt$(snap7?.cpl ?? null)}</strong></span>
                  <span>Cost/Appointment: <strong style={{ color: 'var(--text)' }}>{fmt$(snap7?.cost_per_appointment ?? null)}</strong></span>
                </div>
                {entry.observation && <p className="text-sm mb-2">{entry.observation}</p>}
                {entry.actions.map((a, i) => (
                  <p key={i} className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--accent)' }}>Action:</strong> {a.action_taken}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

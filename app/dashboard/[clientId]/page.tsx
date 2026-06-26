'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Client, Quote, PipelineStats } from '@/types';
import { calcMetrics } from '@/lib/metrics';
import {
  ArrowLeft, RefreshCw, ExternalLink, FileText, MessageSquare,
  TrendingUp, Users, PhoneCall, Home, XCircle, DollarSign,
  Plus, CheckCircle, Clock, Settings,
} from 'lucide-react';
import QuoteModal from '@/components/QuoteModal';
import EditClientModal from '@/components/EditClientModal';

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, count, max, color, icon }: { label: string; count: number; max: number; color: string; icon: React.ReactNode }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="card-2 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-xl font-bold">{count}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  open: '#f59e0b',
  closed: '#22c55e',
  lost: '#ef4444',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <Clock size={12} />,
  closed: <CheckCircle size={12} />,
  lost: <XCircle size={12} />,
};

export default function ClientDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<Client | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStats>({ leads: 0, contacted: 0, unqualified: 0, phone: 0, inhome: 0 });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const user = session?.user as any;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    const [cRes, qRes] = await Promise.all([
      fetch(`/api/clients/${clientId}`),
      fetch(`/api/clients/${clientId}/quotes`),
    ]);
    if (!cRes.ok) { router.push('/dashboard'); return; }
    const [c, q] = await Promise.all([cRes.json(), qRes.json()]);
    setClient(c);
    setQuotes(Array.isArray(q) ? q : []);
    setLoading(false);
  }, [clientId, status, router]);

  const syncGHL = useCallback(async () => {
    setSyncing(true);
    const res = await fetch(`/api/clients/${clientId}/ghl`);
    if (res.ok) { setPipeline(await res.json()); setLastSynced(new Date()); }
    setSyncing(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (client) syncGHL();
  }, [client?.id, syncGHL]);

  // Auto-sync every hour
  useEffect(() => {
    const interval = setInterval(syncGHL, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncGHL]);

  if (loading || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  const metrics = calcMetrics(client, quotes, pipeline);
  const totalLeads = pipeline.leads;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> All Clients
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs" style={{ background: 'var(--accent)' }}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold">{client.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {client.slack_url && (
            <a href={client.slack_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm flex items-center gap-2">
              <MessageSquare size={14} /> Slack
            </a>
          )}
          {client.contract_url && (
            <a href={client.contract_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm flex items-center gap-2">
              <FileText size={14} /> Contract
            </a>
          )}
          <button onClick={syncGHL} className="btn-ghost text-sm flex items-center gap-2" disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync GHL'}
          </button>
          {user?.role === 'admin' && (
            <button onClick={() => setShowEdit(true)} className="btn-ghost text-sm flex items-center gap-2">
              <Settings size={14} /> Edit
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Billing dates strip */}
        {(client.date_launched || client.date_billed || client.rebilling_date) && (
          <div className="flex flex-wrap gap-4 text-sm px-1">
            {client.date_launched && (
              <span style={{ color: 'var(--text-muted)' }}>
                Launched <span className="font-semibold" style={{ color: 'var(--text)' }}>{new Date(client.date_launched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </span>
            )}
            {client.date_billed && (
              <span style={{ color: 'var(--text-muted)' }}>
                Last Billed <span className="font-semibold" style={{ color: 'var(--text)' }}>{new Date(client.date_billed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </span>
            )}
            {client.rebilling_date && (
              <span style={{ color: 'var(--text-muted)' }}>
                Rebills <span className="font-semibold" style={{ color: 'var(--yellow)' }}>{new Date(client.rebilling_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </span>
            )}
          </div>
        )}

        {/* Header stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <MetricCard label="Days Together" value={`${metrics.daysTogether}`} sub={`${metrics.monthsWorked} month${metrics.monthsWorked !== 1 ? 's' : ''}`} color="var(--accent)" />
          <MetricCard label="Ad Spend" value={`$${Math.round(metrics.totalAdSpend).toLocaleString()}`} sub={client.daily_ad_spend > 0 ? `$${client.daily_ad_spend}/day` : 'total'} />
          <MetricCard label="CPL" value={metrics.cpl > 0 ? `$${Math.round(metrics.cpl).toLocaleString()}` : '—'} sub="cost per lead" />
          <MetricCard label="Retainer" value={`$${client.retainer_price.toLocaleString()}`} sub="per month" />
          <MetricCard label="Total Revenue" value={`$${metrics.totalRevenue.toLocaleString()}`} sub="from closed deals" color="var(--green)" />
          <MetricCard
            label="ROI"
            value={`${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(1)}%`}
            sub="return on investment"
            color={metrics.roi >= 0 ? 'var(--green)' : 'var(--red)'}
          />
          <MetricCard label="CAC" value={metrics.cac > 0 ? `$${Math.round(metrics.cac).toLocaleString()}` : '—'} sub="cost per customer" />
          <MetricCard label="ROAS" value={`${metrics.roas.toFixed(2)}x`} sub="return on ad spend" color={metrics.roas >= 2 ? 'var(--green)' : 'var(--yellow)'} />
        </div>

        {/* Pipeline funnel */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp size={18} style={{ color: 'var(--accent)' }} /> Pipeline Funnel
            </h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              {lastSynced ? `Synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Synced from GHL'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <FunnelBar label="Leads Generated" count={pipeline.leads} max={totalLeads || 1} color="var(--accent)" icon={<Users size={14} />} />
            <FunnelBar label="Contacted" count={pipeline.contacted} max={totalLeads || 1} color="#a78bfa" icon={<PhoneCall size={14} />} />
            <FunnelBar label="Booked Phone" count={pipeline.phone} max={totalLeads || 1} color="var(--yellow)" icon={<PhoneCall size={14} />} />
            <FunnelBar label="Booked In-Home" count={pipeline.inhome} max={totalLeads || 1} color="var(--green)" icon={<Home size={14} />} />
            <FunnelBar label="Unqualified" count={pipeline.unqualified} max={totalLeads || 1} color="var(--red)" icon={<XCircle size={14} />} />
          </div>
        </div>

        {/* Quotes section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <DollarSign size={18} style={{ color: 'var(--accent)' }} /> Quotes & Deals
            </h2>
            <button onClick={() => { setEditingQuote(null); setShowQuote(true); }} className="btn-primary text-sm flex items-center gap-2">
              <Plus size={14} /> Add Quote
            </button>
          </div>

          {/* Compact summary */}
          {quotes.length > 0 && (
            <div className="flex items-center gap-4 mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{quotes.filter(q => q.status === 'open').length} open</span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>{quotes.filter(q => q.status === 'closed').length} closed</span>
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>{quotes.filter(q => q.status === 'lost').length} lost</span>
              {metrics.totalRevenue > 0 && (
                <span style={{ color: 'var(--text-muted)' }}>· ${metrics.totalRevenue.toLocaleString()} revenue</span>
              )}
            </div>
          )}

          {quotes.length === 0 ? (
            <div className="card p-10 text-center">
              <FileText size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-muted)' }}>No quotes yet. Add your first quote above.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Customer</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Value</th>
                    <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Notes</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q, i) => (
                    <tr
                      key={q.id}
                      style={{ borderBottom: i < quotes.length - 1 ? '1px solid var(--border)' : 'none' }}
                      className="hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{q.customer_name}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: q.status === 'closed' ? 'var(--green)' : 'var(--text)' }}>
                        ${q.value.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${STATUS_COLORS[q.status]}22`, color: STATUS_COLORS[q.status] }}>
                          {STATUS_ICONS[q.status]} {q.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {q.notes || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                        {new Date(q.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {q.drive_url && (
                            <a href={q.drive_url} target="_blank" rel="noopener noreferrer" title="View quote" style={{ color: 'var(--text-muted)' }} className="hover:text-[var(--accent)] transition-colors">
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <button
                            onClick={() => { setEditingQuote(q); setShowQuote(true); }}
                            className="text-xs hover:opacity-70 transition-opacity"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>


      </div>

      {showQuote && (
        <QuoteModal
          clientId={clientId}
          quote={editingQuote}
          onClose={() => { setShowQuote(false); setEditingQuote(null); }}
          onSaved={(q) => {
            setQuotes((prev) =>
              editingQuote
                ? prev.map((x) => (x.id === q.id ? q : x))
                : [q, ...prev]
            );
            setShowQuote(false);
            setEditingQuote(null);
          }}
          onDeleted={(id) => {
            setQuotes((prev) => prev.filter((x) => x.id !== id));
            setShowQuote(false);
            setEditingQuote(null);
          }}
        />
      )}

      {showEdit && (
        <EditClientModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={(c) => { setClient(c); setShowEdit(false); }}
        />
      )}
    </div>
  );
}

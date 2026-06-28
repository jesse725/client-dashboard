'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Client, Quote, PipelineStats } from '@/types';
import { calcMetrics } from '@/lib/metrics';
import {
  ArrowLeft, RefreshCw, ExternalLink, FileText,
  TrendingUp, Users, PhoneCall, Home, XCircle, DollarSign,
  Plus, CheckCircle, Clock, Settings, Target, BarChart2, Zap,
  MousePointerClick, Eye, Activity,
} from 'lucide-react';
import QuoteModal from '@/components/QuoteModal';
import EditClientModal from '@/components/EditClientModal';
import CallNotesSection from '@/components/CallNotesSection';

// ─── Small reusable components ────────────────────────────────────────────────

function SectionHeader({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)22' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
      </div>
      <h2 className="font-semibold text-lg">{title}</h2>
      {badge && (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      {icon && <span style={{ color: color ?? 'var(--text-muted)' }}>{icon}</span>}
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-bold leading-none" style={{ color: color ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

function HeroStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-4xl font-black leading-none mb-1" style={{ color: color ?? 'var(--accent)' }}>{value}</p>
      {sub && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, count, max, color, icon, rate }: {
  label: string; count: number; max: number; color: string; icon: React.ReactNode; rate?: string;
}) {
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
      {rate && <p className="text-xs mt-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{rate}</p>}
    </div>
  );
}

function RatePill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card-2 px-4 py-3 text-center">
      <p className="text-xl font-bold" style={{ color: color ?? 'var(--accent)' }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = { open: '#f59e0b', closed: '#22c55e', lost: '#ef4444' };
const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <Clock size={12} />, closed: <CheckCircle size={12} />, lost: <XCircle size={12} />,
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ClientDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<Client | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStats>({ leads: 0, contacted: 0, unqualified: 0, phone: 0, inhome: 0 });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [metaStats, setMetaStats] = useState<{
    spend: number; impressions: number; clicks: number; ctr: number; cpc: number; reach: number; frequency: number;
  } | null>(null);
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
    if (res.ok) {
      const data = await res.json();
      setPipeline(data.pipeline ?? data);
      if (data.metaStats) setMetaStats(data.metaStats);
      setLastSynced(new Date());
    }
    setSyncing(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (client) syncGHL(); }, [client?.id, syncGHL]);
  useEffect(() => {
    const interval = setInterval(syncGHL, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncGHL]);

  if (loading || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const m = calcMetrics(client, quotes, pipeline);
  const totalLeads = Math.max(pipeline.leads, 1);

  // Use live Meta spend if available, else fall through to calcMetrics
  const adSpend = metaStats?.spend ?? m.totalAdSpend;
  const totalCost = adSpend + m.totalRetainer;
  const roi = totalCost > 0 ? ((m.totalRevenue - totalCost) / totalCost) * 100 : 0;
  const roas = adSpend > 0 ? m.totalRevenue / adSpend : 0;
  const cpl = pipeline.leads > 0 ? adSpend / pipeline.leads : 0;

  const totalQuoted = quotes.reduce((s, q) => s + q.value, 0);
  const openValue = quotes.filter(q => q.status === 'open').reduce((s, q) => s + q.value, 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> All Clients
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs"
              style={{ background: 'var(--accent)' }}>
              {client.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold">{client.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {client.contract_url && (
            <a href={client.contract_url} target="_blank" rel="noopener noreferrer"
              className="btn-ghost text-sm flex items-center gap-2">
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

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* Date strip */}
        {(client.date_launched || client.date_billed || client.rebilling_date || client.start_date) && (
          <div className="flex flex-wrap gap-6 text-sm">
            {client.start_date && (
              <span style={{ color: 'var(--text-muted)' }}>
                Partner since <span className="font-semibold" style={{ color: 'var(--text)' }}>
                  {new Date(client.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="ml-2 font-semibold" style={{ color: 'var(--accent)' }}>· {m.daysTogether} days</span>
              </span>
            )}
            {client.rebilling_date && (
              <span style={{ color: 'var(--text-muted)' }}>
                Next billing <span className="font-semibold" style={{ color: 'var(--yellow)' }}>
                  {new Date(client.rebilling_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </span>
            )}
          </div>
        )}

        {/* ─── SECTION 1: Ad Performance ────────────────────────────────── */}
        <section>
          <SectionHeader icon={<BarChart2 size={15} />} title="Ad Performance"
            badge={metaStats ? 'Live from Meta' : client.daily_ad_spend > 0 ? 'Estimated' : 'Manual'} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Ad Spend"
              value={`$${Math.round(adSpend).toLocaleString()}`}
              sub={metaStats ? 'all-time from Meta' : client.daily_ad_spend > 0 ? `$${client.daily_ad_spend}/day` : 'manual'}
              color="var(--accent)"
              icon={<DollarSign size={14} />}
            />
            <StatCard
              label="CPL"
              value={cpl > 0 ? `$${Math.round(cpl).toLocaleString()}` : '—'}
              sub="cost per lead"
              icon={<Target size={14} />}
            />
            {metaStats ? (
              <>
                <StatCard
                  label="Impressions"
                  value={metaStats.impressions >= 1000 ? `${(metaStats.impressions / 1000).toFixed(1)}k` : String(metaStats.impressions)}
                  sub="total ad views"
                  icon={<Eye size={14} />}
                />
                <StatCard
                  label="Clicks"
                  value={metaStats.clicks.toLocaleString()}
                  sub="link clicks"
                  icon={<MousePointerClick size={14} />}
                />
                <StatCard
                  label="CTR"
                  value={`${metaStats.ctr.toFixed(2)}%`}
                  sub="click-through rate"
                  color={metaStats.ctr >= 1 ? 'var(--green)' : metaStats.ctr >= 0.5 ? 'var(--yellow)' : 'var(--red)'}
                  icon={<Activity size={14} />}
                />
                <StatCard
                  label="CPC"
                  value={`$${metaStats.cpc.toFixed(2)}`}
                  sub="cost per click"
                  icon={<Zap size={14} />}
                />
              </>
            ) : (
              <div className="col-span-4 card p-4 flex items-center justify-center text-sm"
                style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                Connect Meta Ads in Edit → to see live impressions, clicks, CTR & CPC
              </div>
            )}
          </div>
        </section>

        {/* ─── SECTION 2: Follow-up Pipeline ───────────────────────────── */}
        <section>
          <SectionHeader icon={<TrendingUp size={15} />} title="Backend Follow-up"
            badge={lastSynced ? `Synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'From GHL'} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <FunnelBar label="Leads Generated" count={pipeline.leads} max={totalLeads} color="var(--accent)"
              icon={<Users size={14} />} />
            <FunnelBar label="Contacted" count={pipeline.contacted} max={totalLeads} color="#a78bfa"
              icon={<PhoneCall size={14} />}
              rate={pipeline.leads > 0 ? `${((pipeline.contacted / pipeline.leads) * 100).toFixed(1)}% contact rate` : undefined} />
            <FunnelBar label="Phone Booked" count={pipeline.phone} max={totalLeads} color="var(--yellow)"
              icon={<PhoneCall size={14} />}
              rate={pipeline.leads > 0 ? `${((pipeline.phone / pipeline.leads) * 100).toFixed(1)}% of leads` : undefined} />
            <FunnelBar label="In-Home Booked" count={pipeline.inhome} max={totalLeads} color="var(--green)"
              icon={<Home size={14} />}
              rate={pipeline.phone > 0 ? `${((pipeline.inhome / pipeline.phone) * 100).toFixed(1)}% of booked` : undefined} />
            <FunnelBar label="Unqualified" count={pipeline.unqualified} max={totalLeads} color="var(--red)"
              icon={<XCircle size={14} />} />
          </div>
          {/* Conversion rate pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <RatePill label="Contact Rate" value={`${m.contactRate.toFixed(1)}%`}
              color={m.contactRate >= 50 ? 'var(--green)' : 'var(--yellow)'} />
            <RatePill label="Lead → Phone" value={`${m.leadToBookRate.toFixed(1)}%`}
              color={m.leadToBookRate >= 20 ? 'var(--green)' : 'var(--yellow)'} />
            <RatePill label="Phone → In-Home" value={`${m.bookToHomeRate.toFixed(1)}%`}
              color={m.bookToHomeRate >= 50 ? 'var(--green)' : 'var(--yellow)'} />
            <RatePill label="In-Home → Close" value={`${m.homeToCloseRate.toFixed(1)}%`}
              color={m.homeToCloseRate >= 30 ? 'var(--green)' : 'var(--yellow)'} />
          </div>
        </section>

        {/* ─── SECTION 3: Sales ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)22' }}>
                <DollarSign size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <h2 className="font-semibold text-lg">Sales Results</h2>
            </div>
            <button onClick={() => { setEditingQuote(null); setShowQuote(true); }}
              className="btn-primary text-sm flex items-center gap-2">
              <Plus size={14} /> Add Quote
            </button>
          </div>

          {/* Sales summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <StatCard
              label="Live Ad Spend"
              value={`$${Math.round(adSpend).toLocaleString()}`}
              sub={metaStats ? 'live from Meta' : client.daily_ad_spend > 0 ? 'estimated' : 'manual'}
              color="var(--accent)"
              icon={<DollarSign size={14} />}
            />
            <StatCard
              label="Cost Per Lead"
              value={cpl > 0 ? `$${Math.round(cpl).toLocaleString()}` : '—'}
              sub={pipeline.leads > 0 ? `across ${pipeline.leads} leads` : 'no leads yet'}
              color={cpl > 0 && cpl <= 50 ? 'var(--green)' : cpl > 50 && cpl <= 150 ? 'var(--yellow)' : cpl > 150 ? 'var(--red)' : undefined}
              icon={<Target size={14} />}
            />
            <StatCard
              label="Jobs Quoted"
              value={String(quotes.length)}
              sub={`$${totalQuoted.toLocaleString()} total value`}
              color="var(--yellow)"
              icon={<FileText size={14} />}
            />
            <StatCard
              label="Jobs Closed"
              value={String(m.closedDeals)}
              sub={`$${m.totalRevenue.toLocaleString()} revenue`}
              color="var(--green)"
              icon={<CheckCircle size={14} />}
            />
            <StatCard
              label="Close Rate"
              value={`${m.closeRateByCount.toFixed(1)}%`}
              sub={`${m.closeRateByValue.toFixed(1)}% by value`}
              color={m.closeRateByCount >= 30 ? 'var(--green)' : 'var(--yellow)'}
              icon={<TrendingUp size={14} />}
            />
          </div>

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
                    <tr key={q.id}
                      style={{ borderBottom: i < quotes.length - 1 ? '1px solid var(--border)' : 'none' }}
                      className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3 font-medium">{q.customer_name}</td>
                      <td className="px-4 py-3 text-right font-semibold"
                        style={{ color: q.status === 'closed' ? 'var(--green)' : 'var(--text)' }}>
                        ${q.value.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: `${STATUS_COLORS[q.status]}22`, color: STATUS_COLORS[q.status] }}>
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
                            <a href={q.drive_url} target="_blank" rel="noopener noreferrer"
                              title="View quote" style={{ color: 'var(--text-muted)' }}
                              className="hover:text-[var(--accent)] transition-colors">
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <button onClick={() => { setEditingQuote(q); setShowQuote(true); }}
                            className="text-xs hover:opacity-70 transition-opacity"
                            style={{ color: 'var(--text-muted)' }}>
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
        </section>

        {/* ─── SECTION 4: ROI / ROAS / CAC ─────────────────────────────── */}
        <section>
          <SectionHeader icon={<Zap size={15} />} title="Performance Summary" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HeroStat
              label="Return on Investment"
              value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`}
              sub={`$${Math.round(m.totalRevenue).toLocaleString()} revenue on $${Math.round(totalCost).toLocaleString()} invested`}
              color={roi >= 0 ? 'var(--green)' : 'var(--red)'}
            />
            <HeroStat
              label="Return on Ad Spend"
              value={`${roas.toFixed(2)}x`}
              sub={`$${roas.toFixed(2)} back for every $1 in ads`}
              color={roas >= 3 ? 'var(--green)' : roas >= 1 ? 'var(--yellow)' : 'var(--red)'}
            />
            <HeroStat
              label="Cost to Acquire Customer"
              value={m.cac > 0 ? `$${Math.round(m.cac).toLocaleString()}` : '—'}
              sub={m.cac > 0 ? `avg across ${m.closedDeals} customer${m.closedDeals !== 1 ? 's' : ''}` : 'No closed deals yet'}
            />
          </div>
          {/* Retainer context */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs px-1" style={{ color: 'var(--text-muted)' }}>
            <span>Retainer <span className="font-semibold" style={{ color: 'var(--text)' }}>${client.retainer_price.toLocaleString()}/mo · ${Math.round(m.totalRetainer).toLocaleString()} total</span></span>
            <span>Ad Spend <span className="font-semibold" style={{ color: 'var(--text)' }}>${Math.round(adSpend).toLocaleString()} total</span></span>
            <span>Total Invested <span className="font-semibold" style={{ color: 'var(--text)' }}>${Math.round(totalCost).toLocaleString()}</span></span>
          </div>
        </section>

        {/* ─── SECTION 5: Call Notes ────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)22' }}>
              <PhoneCall size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Call Notes & History</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sales, onboarding, launch & check-in summaries</p>
            </div>
          </div>
          <CallNotesSection clientId={Number(clientId)} isAdmin={true} />
        </section>

      </div>

      {showQuote && (
        <QuoteModal
          clientId={clientId}
          quote={editingQuote}
          onClose={() => { setShowQuote(false); setEditingQuote(null); }}
          onSaved={(q) => {
            setQuotes((prev) => editingQuote ? prev.map((x) => (x.id === q.id ? q : x)) : [q, ...prev]);
            setShowQuote(false); setEditingQuote(null);
          }}
          onDeleted={(id) => {
            setQuotes((prev) => prev.filter((x) => x.id !== id));
            setShowQuote(false); setEditingQuote(null);
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

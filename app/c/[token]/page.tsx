'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import CallNotesSection from '@/components/CallNotesSection';
import {
  TrendingUp, Users, PhoneCall, Home, XCircle, DollarSign,
  CheckCircle, Clock, ExternalLink, FileText, RefreshCw,
  Calendar, BarChart2, Zap, Award, Target, Eye, MousePointerClick, Activity,
} from 'lucide-react';

interface ShareData {
  client: {
    id: number; name: string; logo_url: string | null; retainer_price: number;
    ad_spend: number; daily_ad_spend: number; start_date: string;
    contract_url: string | null; next_checkin: string | null;
    date_launched: string | null; date_billed: string | null; rebilling_date: string | null;
  };
  pipeline: { leads: number; contacted: number; unqualified: number; phone: number; inhome: number };
  metaStats: {
    spend: number; impressions: number; clicks: number;
    ctr: number; cpc: number; reach: number; frequency: number;
  } | null;
  quotes: Array<{
    id: number; customer_name: string; value: number;
    status: 'open' | 'closed' | 'lost'; drive_url: string | null;
    notes: string | null; created_at: string;
  }>;
  metrics: {
    daysTogether: number; monthsWorked: number;
    totalRevenue: number; pipelineValue: number;
    totalQuoted: number; closedDeals: number;
    avgDealValue: number; avgQuoteValue: number;
    closeRateByValue: number; closeRateByCount: number;
    totalAdSpend: number; totalRetainer: number; totalCost: number;
    roi: number; cac: number; roas: number; cpl: number;
    contactRate: number; leadToBookRate: number; bookToHomeRate: number;
    homeToCloseRate: number; leadToCloseRate: number;
  };
}

const C = {
  bg: '#0f1117', surface: '#1a1d27', surface2: '#242736', border: '#2e3147',
  accent: '#6c63ff', text: '#e8e9f0', muted: '#8b8fa8',
  green: '#22c55e', red: '#ef4444', yellow: '#f59e0b', blue: '#3b82f6',
};
const font = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

function fmt(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtUSD(n: number) { return '$' + fmt(n); }
function fmtPct(n: number) { return n.toFixed(1) + '%'; }
function rc(v: number, lo: number, hi: number) { return v >= hi ? C.green : v >= lo ? C.yellow : C.red; }

function Tile({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      {icon && <div style={{ color: color ?? C.muted, marginBottom: 6 }}>{icon}</div>}
      <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color ?? C.text, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function HeroTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 10 }}>{label}</p>
      <p style={{ fontSize: 42, fontWeight: 900, color: color ?? C.accent, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function FunnelStep({ label, count, pct, color, icon, rate }: {
  label: string; count: number; pct: number; color: string; icon: React.ReactNode; rate?: string;
}) {
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{label}</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{count}</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: C.border }}>
        <div style={{ height: 4, borderRadius: 4, width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      {rate && <p style={{ fontSize: 10, color: C.muted, marginTop: 6, textAlign: 'right' }}>{rate}</p>}
    </div>
  );
}

function RateTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: 26, fontWeight: 800, color: color ?? C.accent, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: C.muted }}>{sub}</p>}
    </div>
  );
}

function SectionHead({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${C.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{label}</span>
      {badge && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: C.surface2, color: C.muted, fontWeight: 500 }}>{badge}</span>}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = { open: C.yellow, closed: C.green, lost: C.red };
const STATUS_ICON: Record<string, React.ReactNode> = {
  open: <Clock size={10} />, closed: <CheckCircle size={10} />, lost: <XCircle size={10} />,
};

export default function ClientSharePage() {
  const { token } = useParams() as { token: string };
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/share/${token}`);
    if (!res.ok) { setError('This link is invalid or has been deactivated.'); setLoading(false); setRefreshing(false); return; }
    setData(await res.json());
    setLastSynced(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: font }}>
      <div style={{ textAlign: 'center' }}>
        <RefreshCw size={24} style={{ color: C.accent, margin: '0 auto 10px', display: 'block', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: C.muted, fontSize: 13 }}>Loading your results…</p>
      </div>
      <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: font }}>
      <p style={{ color: C.red, fontSize: 14 }}>{error || 'Something went wrong.'}</p>
    </div>
  );

  const { client, pipeline, metaStats, quotes, metrics } = data;
  const adSpend = metaStats?.spend ?? metrics.totalAdSpend;
  const totalCost = adSpend + metrics.totalRetainer;
  const roi = totalCost > 0 ? ((metrics.totalRevenue - totalCost) / totalCost) * 100 : 0;
  const roas = adSpend > 0 ? metrics.totalRevenue / adSpend : 0;
  const cpl = pipeline.leads > 0 ? adSpend / pipeline.leads : 0;
  const totalQuoted = quotes.reduce((s, q) => s + q.value, 0);
  const openValue = quotes.filter(q => q.status === 'open').reduce((s, q) => s + q.value, 0);

  const nextCheckin = client.next_checkin ? new Date(client.next_checkin) : null;
  const checkinDaysOut = nextCheckin ? Math.ceil((nextCheckin.getTime() - Date.now()) / 86400000) : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: font }}>
      <style>{`@keyframes spin { to { transform:rotate(360deg) } } * { box-sizing:border-box; margin:0; padding:0; }`}</style>

      {/* Nav */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: 'white', flexShrink: 0 }}>M</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{client.name}</p>
            <p style={{ fontSize: 11, color: C.muted }}>Results Dashboard · Merova Media</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {client.contract_url && (
            <a href={client.contract_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', fontSize: 12 }}>
              <FileText size={12} /> Contract
            </a>
          )}
          <button onClick={() => { setRefreshing(true); load(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.muted, background: 'transparent', cursor: 'pointer', fontSize: 12 }}>
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 36 }}>

        {/* Partnership hero */}
        <div style={{ display: 'grid', gridTemplateColumns: nextCheckin ? '1fr 1fr' : '1fr', gap: 16 }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)', border: '1px solid #4c1d95', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(109,40,217,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Award size={26} color="#a78bfa" />
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Partnership</p>
              <p style={{ fontSize: 38, fontWeight: 800, color: 'white', lineHeight: 1 }}>{metrics.daysTogether} <span style={{ fontSize: 18, fontWeight: 500, color: '#c4b5fd' }}>days</span></p>
              <p style={{ fontSize: 12, color: '#c4b5fd', marginTop: 4 }}>Since {new Date(client.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
          {nextCheckin && (
            <div style={{ background: 'linear-gradient(135deg, #0c1a2e 0%, #0f2847 100%)', border: '1px solid #1e3a5f', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={26} color={C.blue} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Next Check-In</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
                  {nextCheckin.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
                  {checkinDaysOut != null && checkinDaysOut > 0 ? `In ${checkinDaysOut} day${checkinDaysOut === 1 ? '' : 's'}`
                    : checkinDaysOut === 0 ? 'Today!' : nextCheckin.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 1: Ad Performance ─────────────────────────────────── */}
        <section>
          <SectionHead icon={<BarChart2 size={14} />} label="Ad Performance"
            badge={metaStats ? 'Live from Meta' : client.daily_ad_spend > 0 ? 'Estimated' : 'Manual'} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <Tile label="Ad Spend" value={fmtUSD(adSpend)}
              sub={metaStats ? 'all-time from Meta' : client.daily_ad_spend > 0 ? `$${client.daily_ad_spend}/day` : 'manual total'}
              color={C.accent} icon={<DollarSign size={14} />} />
            <Tile label="Cost Per Lead" value={cpl > 0 ? fmtUSD(cpl) : '—'} sub="per lead generated" icon={<Target size={14} />} />
            {metaStats ? (
              <>
                <Tile label="Impressions"
                  value={metaStats.impressions >= 1000 ? `${(metaStats.impressions / 1000).toFixed(1)}k` : fmt(metaStats.impressions)}
                  sub="total ad views" icon={<Eye size={14} />} />
                <Tile label="Reach"
                  value={metaStats.reach >= 1000 ? `${(metaStats.reach / 1000).toFixed(1)}k` : fmt(metaStats.reach)}
                  sub="unique people" icon={<Users size={14} />} />
                <Tile label="Clicks" value={fmt(metaStats.clicks)} sub="link clicks" icon={<MousePointerClick size={14} />} />
                <Tile label="CTR" value={fmtPct(metaStats.ctr)} sub="click-through rate"
                  color={rc(metaStats.ctr, 0.5, 1.5)} icon={<Activity size={14} />} />
                <Tile label="CPC" value={`$${metaStats.cpc.toFixed(2)}`} sub="cost per click" icon={<Zap size={14} />} />
              </>
            ) : (
              <div style={{ gridColumn: 'span 5', background: C.surface2, border: `1px dashed ${C.border}`, borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <p style={{ color: C.muted, fontSize: 12 }}>Meta Ads not connected — impressions, clicks, CTR and CPC will appear here once linked.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 2: Backend Follow-up ─────────────────────────────── */}
        <section>
          <SectionHead icon={<TrendingUp size={14} />} label="Backend Follow-up"
            badge={lastSynced ? `Synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'From GHL'} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
            <FunnelStep label="Leads Generated" count={pipeline.leads} pct={100} color={C.accent} icon={<Users size={14} />} />
            <FunnelStep label="Contacted" count={pipeline.contacted}
              pct={pipeline.leads > 0 ? (pipeline.contacted / pipeline.leads) * 100 : 0}
              color="#a78bfa" icon={<PhoneCall size={14} />}
              rate={pipeline.leads > 0 ? `${((pipeline.contacted / pipeline.leads) * 100).toFixed(1)}% of leads` : undefined} />
            <FunnelStep label="Phone Booked" count={pipeline.phone}
              pct={pipeline.leads > 0 ? (pipeline.phone / pipeline.leads) * 100 : 0}
              color={C.yellow} icon={<PhoneCall size={14} />}
              rate={pipeline.leads > 0 ? `${((pipeline.phone / pipeline.leads) * 100).toFixed(1)}% of leads` : undefined} />
            <FunnelStep label="In-Home Booked" count={pipeline.inhome}
              pct={pipeline.leads > 0 ? (pipeline.inhome / pipeline.leads) * 100 : 0}
              color={C.green} icon={<Home size={14} />}
              rate={pipeline.phone > 0 ? `${((pipeline.inhome / pipeline.phone) * 100).toFixed(1)}% of booked` : undefined} />
            <FunnelStep label="Unqualified" count={pipeline.unqualified}
              pct={pipeline.leads > 0 ? (pipeline.unqualified / pipeline.leads) * 100 : 0}
              color={C.red} icon={<XCircle size={14} />} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <RateTile label="Contact Rate" value={fmtPct(metrics.contactRate)} sub="leads that respond" color={rc(metrics.contactRate, 30, 60)} />
            <RateTile label="Lead → Phone" value={fmtPct(metrics.leadToBookRate)} sub="leads that book" color={rc(metrics.leadToBookRate, 15, 30)} />
            <RateTile label="Phone → In-Home" value={fmtPct(metrics.bookToHomeRate)} sub="calls → in-person" color={rc(metrics.bookToHomeRate, 40, 70)} />
            <RateTile label="In-Home → Close" value={fmtPct(metrics.homeToCloseRate)} sub="quotes that close" color={rc(metrics.homeToCloseRate, 30, 60)} />
          </div>
        </section>

        {/* ── SECTION 3: Sales Results ──────────────────────────────────── */}
        <section>
          <SectionHead icon={<DollarSign size={14} />} label="Sales Results" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Tile label="Live Ad Spend" value={fmtUSD(adSpend)}
              sub={metaStats ? 'live from Meta' : 'estimated'} color={C.accent} />
            <Tile label="Jobs Quoted" value={String(quotes.length)}
              sub={`${fmtUSD(totalQuoted)} total value`} color={C.yellow} />
            <Tile label="Jobs Closed" value={String(metrics.closedDeals)}
              sub={`${fmtUSD(metrics.totalRevenue)} revenue`} color={C.green} />
            <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 26, fontWeight: 800, color: rc(metrics.closeRateByCount, 20, 50), lineHeight: 1 }}>{fmtPct(metrics.closeRateByCount)}</p>
              <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginTop: 6 }}>Close Rate</p>
              <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{fmtPct(metrics.closeRateByValue)} by value</p>
            </div>
          </div>

          {quotes.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                    {['Customer', 'Value', 'Status', 'Notes', 'Date', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, fontSize: 11, color: C.muted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q, i) => (
                    <tr key={q.id} style={{ borderBottom: i < quotes.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{q.customer_name}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: q.status === 'closed' ? C.green : C.text }}>{fmtUSD(q.value)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: `${STATUS_COLOR[q.status]}22`, color: STATUS_COLOR[q.status] }}>
                          {STATUS_ICON[q.status]} {q.status}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.notes || '—'}</td>
                      <td style={{ padding: '11px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{new Date(q.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {q.drive_url && (
                          <a href={q.drive_url} target="_blank" rel="noopener noreferrer" style={{ color: C.muted }}>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── SECTION 4: ROI / ROAS / CAC ──────────────────────────────── */}
        <section>
          <SectionHead icon={<Zap size={14} />} label="Performance Summary" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <HeroTile
              label="Return on Investment"
              value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`}
              sub={`$${fmt(metrics.totalRevenue)} revenue on $${fmt(totalCost)} invested`}
              color={roi >= 0 ? C.green : C.red}
            />
            <HeroTile
              label="Return on Ad Spend"
              value={`${roas.toFixed(2)}x`}
              sub={`$${roas.toFixed(2)} back for every $1 in ads`}
              color={roas >= 3 ? C.green : roas >= 1 ? C.yellow : C.red}
            />
            <HeroTile
              label="Cost to Acquire Customer"
              value={metrics.cac > 0 ? fmtUSD(metrics.cac) : '—'}
              sub={metrics.cac > 0 ? `avg across ${metrics.closedDeals} customer${metrics.closedDeals !== 1 ? 's' : ''}` : 'No closed deals yet'}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12, fontSize: 12, color: C.muted }}>
            <span>Retainer <span style={{ color: C.text, fontWeight: 600 }}>${client.retainer_price.toLocaleString()}/mo · ${fmt(metrics.totalRetainer)} total</span></span>
            <span>Ad Spend <span style={{ color: C.text, fontWeight: 600 }}>${fmt(adSpend)} total</span></span>
            <span>Total Invested <span style={{ color: C.text, fontWeight: 600 }}>${fmt(totalCost)}</span></span>
          </div>
        </section>

        {/* ── SECTION 5: Call Notes ─────────────────────────────────────── */}
        <section style={{ paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PhoneCall size={14} color={C.accent} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Call Notes & History</p>
              <p style={{ fontSize: 12, color: C.muted }}>Your sales, onboarding, launch & check-in summaries</p>
            </div>
          </div>
          <CallNotesSection clientId={client.id} isAdmin={false} />
        </section>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {client.contract_url && (
            <a href={client.contract_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: C.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              <FileText size={11} /> View Contract
            </a>
          )}
          <p style={{ fontSize: 11, color: C.muted }}>
            Merova Media · {lastSynced ? `Last synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Syncing…'}
          </p>
        </div>
      </div>
    </div>
  );
}

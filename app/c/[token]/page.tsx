'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  TrendingUp, Users, PhoneCall, Home, XCircle, DollarSign,
  CheckCircle, Clock, ExternalLink, FileText, MessageSquare,
  RefreshCw, Calendar, Target, BarChart2, Zap, Award,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ShareData {
  client: {
    name: string; logo_url: string | null; retainer_price: number;
    ad_spend: number; daily_ad_spend: number; start_date: string;
    contract_url: string | null; slack_url: string | null; next_checkin: string | null;
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

// ─── Design tokens (inline so no Tailwind needed — embeds cleanly in GHL) ────
const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#242736',
  border: '#2e3147',
  accent: '#6c63ff',
  text: '#e8e9f0',
  muted: '#8b8fa8',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
  blue: '#3b82f6',
};

const font = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

// ─── Small components ─────────────────────────────────────────────────────────
function MetricTile({
  label, value, sub, color, icon, large,
}: {
  label: string; value: string; sub?: string; color?: string;
  icon?: React.ReactNode; large?: boolean;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: large ? '18px 20px' : '14px 16px' }}>
      {icon && <div style={{ marginBottom: 8, color: color ?? C.muted }}>{icon}</div>}
      <p style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: large ? 28 : 22, fontWeight: 700, color: color ?? C.text, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function RateTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: 24, fontWeight: 800, color: color ?? C.accent, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: C.muted }}>{sub}</p>}
    </div>
  );
}

function FunnelStep({ label, count, pct, color, icon }: { label: string; count: number; pct?: number; color: string; icon: React.ReactNode }) {
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
        <div style={{ height: 4, borderRadius: 4, width: `${Math.min(100, pct ?? 0)}%`, background: color, transition: 'width 0.6s ease' }} />
      </div>
      {pct !== undefined && (
        <p style={{ fontSize: 10, color: C.muted, marginTop: 6, textAlign: 'right' }}>{pct.toFixed(1)}% of leads</p>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = { open: C.yellow, closed: C.green, lost: C.red };
const STATUS_ICON: Record<string, React.ReactNode> = {
  open: <Clock size={10} />,
  closed: <CheckCircle size={10} />,
  lost: <XCircle size={10} />,
};

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtUSD(n: number) { return '$' + fmt(n); }
function fmtPct(n: number) { return n.toFixed(1) + '%'; }

// ─── Page ─────────────────────────────────────────────────────────────────────
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

  // Auto-sync every hour
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
  const totalLeads = Math.max(pipeline.leads, 1);

  const nextCheckin = client.next_checkin ? new Date(client.next_checkin) : null;
  const checkinDaysOut = nextCheckin
    ? Math.ceil((nextCheckin.getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: font }}>
      <style>{`@keyframes spin { to { transform:rotate(360deg) } } * { box-sizing:border-box; margin:0; padding:0; }`}</style>

      {/* ── Nav ── */}
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
            <a href={client.contract_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', fontSize: 12 }}>
              <FileText size={12} /> Contract
            </a>
          )}
          {client.slack_url && (
            <a href={client.slack_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none', fontSize: 12 }}>
              <MessageSquare size={12} /> Slack
            </a>
          )}
          <button onClick={() => { setRefreshing(true); load(); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.muted, background: 'transparent', cursor: 'pointer', fontSize: 12 }}>
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Hero: days together + next check-in ── */}
        <div style={{ display: 'grid', gridTemplateColumns: nextCheckin ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Days together */}
          <div style={{ background: `linear-gradient(135deg, #1e1b4b 0%, #2e1065 100%)`, border: `1px solid #4c1d95`, borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(109,40,217,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Award size={26} color="#a78bfa" />
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Partnership</p>
              <p style={{ fontSize: 38, fontWeight: 800, color: 'white', lineHeight: 1 }}>{metrics.daysTogether} <span style={{ fontSize: 18, fontWeight: 500, color: '#c4b5fd' }}>days</span></p>
              <p style={{ fontSize: 12, color: '#c4b5fd', marginTop: 4 }}>
                Since {new Date(client.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Next check-in */}
          {nextCheckin && (
            <div style={{ background: `linear-gradient(135deg, #0c1a2e 0%, #0f2847 100%)`, border: `1px solid #1e3a5f`, borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={26} color={C.blue} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Next Check-In Call</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
                  {nextCheckin.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
                  {checkinDaysOut != null && checkinDaysOut > 0
                    ? `In ${checkinDaysOut} day${checkinDaysOut === 1 ? '' : 's'}`
                    : checkinDaysOut === 0
                    ? 'Today!'
                    : nextCheckin.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Billing dates strip ── */}
        {(client.date_launched || client.date_billed || client.rebilling_date) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '14px 20px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13 }}>
            {client.date_launched && (
              <span style={{ color: C.muted }}>
                Ads Launched&nbsp;
                <span style={{ color: C.text, fontWeight: 600 }}>
                  {new Date(client.date_launched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </span>
            )}
            {client.date_billed && (
              <span style={{ color: C.muted }}>
                Last Billed&nbsp;
                <span style={{ color: C.text, fontWeight: 600 }}>
                  {new Date(client.date_billed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </span>
            )}
            {client.rebilling_date && (
              <span style={{ color: C.muted }}>
                Next Bill&nbsp;
                <span style={{ color: C.yellow, fontWeight: 600 }}>
                  {new Date(client.rebilling_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </span>
            )}
          </div>
        )}

        {/* ── Key overview ── */}
        <div>
          <SectionLabel icon={<BarChart2 size={12} />} label="Campaign Overview" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <MetricTile label="Total Ad Spend" value={fmtUSD(metrics.totalAdSpend)} sub={metaStats ? 'from Meta' : client.daily_ad_spend > 0 ? `$${client.daily_ad_spend}/day` : undefined} />
            <MetricTile label="CPL" value={metrics.cpl > 0 ? fmtUSD(metrics.cpl) : '—'} sub="cost per lead" />
            <MetricTile label="Retainer" value={fmtUSD(client.retainer_price)} sub="/month" />
            <MetricTile label="Revenue Generated" value={fmtUSD(metrics.totalRevenue)} color={C.green} />
            <MetricTile label="ROI" value={`${metrics.roi >= 0 ? '+' : ''}${fmtPct(metrics.roi)}`} color={metrics.roi >= 0 ? C.green : C.red} />
            <MetricTile label="ROAS" value={`${metrics.roas.toFixed(2)}x`} color={metrics.roas >= 2 ? C.green : C.yellow} />
            <MetricTile label="CAC" value={fmtUSD(metrics.cac)} sub="cost / customer" />
            <MetricTile label="Avg Deal Value" value={fmtUSD(metrics.avgDealValue)} />
          </div>
        </div>

        {/* ── Meta Ad Performance (only when connected) ── */}
        {metaStats && (
          <div>
            <SectionLabel icon={<Zap size={12} />} label="Meta Ad Performance" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              <MetricTile label="Total Spend" value={fmtUSD(metaStats.spend)} />
              <MetricTile label="Impressions" value={fmt(metaStats.impressions)} />
              <MetricTile label="Reach" value={fmt(metaStats.reach)} />
              <MetricTile label="Clicks" value={fmt(metaStats.clicks)} />
              <MetricTile label="CTR" value={fmtPct(metaStats.ctr)} color={metaStats.ctr >= 1.5 ? C.green : C.yellow} sub="click-through rate" />
              <MetricTile label="CPC" value={`$${metaStats.cpc.toFixed(2)}`} sub="cost per click" />
              <MetricTile label="CPL" value={metrics.cpl > 0 ? fmtUSD(metrics.cpl) : '—'} sub="cost per lead" />
            </div>
          </div>
        )}

        {/* ── Pipeline funnel ── */}
        <div>
          <SectionLabel icon={<TrendingUp size={12} />} label="Lead Pipeline" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <FunnelStep label="Leads Generated" count={pipeline.leads} pct={100} color={C.accent} icon={<Users size={14} />} />
            <FunnelStep label="Contacted" count={pipeline.contacted} pct={pipeline.leads > 0 ? (pipeline.contacted / pipeline.leads) * 100 : 0} color="#a78bfa" icon={<PhoneCall size={14} />} />
            <FunnelStep label="Discovery Call" count={pipeline.phone} pct={pipeline.leads > 0 ? (pipeline.phone / pipeline.leads) * 100 : 0} color={C.yellow} icon={<PhoneCall size={14} />} />
            <FunnelStep label="In-Person Quote" count={pipeline.inhome} pct={pipeline.leads > 0 ? (pipeline.inhome / pipeline.leads) * 100 : 0} color={C.blue} icon={<Home size={14} />} />
            <FunnelStep label="Unqualified" count={pipeline.unqualified} pct={pipeline.leads > 0 ? (pipeline.unqualified / pipeline.leads) * 100 : 0} color={C.red} icon={<XCircle size={14} />} />
          </div>
        </div>

        {/* ── Conversion rates ── */}
        <div>
          <SectionLabel icon={<Target size={12} />} label="Conversion Rates" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <RateTile
              label="Contact Rate"
              value={fmtPct(metrics.contactRate)}
              sub="leads that respond"
              color={rateColor(metrics.contactRate, 30, 60)}
            />
            <RateTile
              label="Lead → Book Rate"
              value={fmtPct(metrics.leadToBookRate)}
              sub="leads that book a call"
              color={rateColor(metrics.leadToBookRate, 20, 40)}
            />
            <RateTile
              label="Book → In-Person"
              value={fmtPct(metrics.bookToHomeRate)}
              sub="calls that become quotes"
              color={rateColor(metrics.bookToHomeRate, 40, 70)}
            />
            <RateTile
              label="Quote → Close"
              value={fmtPct(metrics.homeToCloseRate)}
              sub="in-person quotes closed"
              color={rateColor(metrics.homeToCloseRate, 30, 60)}
            />
            <RateTile
              label="Lead → Close Rate"
              value={fmtPct(metrics.leadToCloseRate)}
              sub="lead-to-customer rate"
              color={rateColor(metrics.leadToCloseRate, 5, 15)}
            />
          </div>
        </div>

        {/* ── Quotes & Deals ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <SectionLabel icon={<DollarSign size={12} />} label="Quotes & Deals" noMargin />
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <span style={{ color: C.yellow }}>{quotes.filter(q => q.status === 'open').length} open</span>
              <span style={{ color: C.green }}>{quotes.filter(q => q.status === 'closed').length} closed</span>
              <span style={{ color: C.red }}>{quotes.filter(q => q.status === 'lost').length} lost</span>
            </div>
          </div>

          {/* Quote value summary stats */}
          {quotes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Quoted</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{fmtUSD(metrics.totalQuoted)}</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{quotes.length} quote{quotes.length !== 1 ? 's' : ''}</p>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Avg Quote Value</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{fmtUSD(metrics.avgQuoteValue)}</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>per quote</p>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Closed</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: C.green }}>{fmtUSD(metrics.totalRevenue)}</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{metrics.closedDeals} deal{metrics.closedDeals !== 1 ? 's' : ''} won</p>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Avg Close Value</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: C.green }}>{fmtUSD(metrics.avgDealValue)}</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>per closed deal</p>
              </div>
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: rateColor(metrics.closeRateByCount, 20, 50) }}>{fmtPct(metrics.closeRateByCount)}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: C.text, marginTop: 2 }}>Close Rate</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>by count</p>
              </div>
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: rateColor(metrics.closeRateByValue, 20, 50) }}>{fmtPct(metrics.closeRateByValue)}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: C.text, marginTop: 2 }}>Value Closed</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>% of quoted $</p>
              </div>
              {metrics.pipelineValue > 0 && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Open Pipeline</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: C.yellow }}>{fmtUSD(metrics.pipelineValue)}</p>
                  <p style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>pending close</p>
                </div>
              )}
            </div>
          )}

          {quotes.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ color: C.muted, fontSize: 13 }}>No quotes logged yet.</p>
            </div>
          ) : (
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
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            {client.contract_url && (
              <a href={client.contract_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileText size={11} /> View Contract
              </a>
            )}
          </div>
          <p style={{ fontSize: 11, color: C.muted }}>
            Merova Media · Results Dashboard · {lastSynced ? `Last synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Syncing…'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionLabel({ icon, label, noMargin }: { icon: React.ReactNode; label: string; noMargin?: boolean }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: noMargin ? 0 : 10, display: 'flex', alignItems: 'center', gap: 5 }}>
      {icon} {label}
    </p>
  );
}

function rateColor(value: number, low: number, high: number): string {
  if (value >= high) return C.green;
  if (value >= low) return C.yellow;
  return C.red;
}

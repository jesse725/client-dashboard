'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Client } from '@/types';
import { X, Link2, Copy, Check, Trash2, Search, Loader2, CheckCircle } from 'lucide-react';
import MetaConnectionTest from './MetaConnectionTest';

interface Props {
  client: Client;
  onClose: () => void;
  onSaved: (c: Client) => void;
}

interface GhlStage { id: string; name: string; position: number }
interface GhlPipeline { id: string; name: string; stages: GhlStage[] }

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{children}</label>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{children}</p>;
}

export default function EditClientModal({ client, onClose, onSaved }: Props) {
  const { data: session } = useSession();
  const canViewFinancials = !!(session?.user as any)?.canViewFinancials;

  const [form, setForm] = useState({
    name: client.name,
    contact_name: (client as any).contact_name ?? '',
    contact_email: (client as any).contact_email ?? '',
    contact_phone: (client as any).contact_phone ?? '',
    address: (client as any).address ?? '',
    ein: (client as any).ein ?? '',
    target_locations: (client as any).target_locations ?? '',
    website_url: (client as any).website_url ?? '',
    start_date: client.start_date,
    date_launched: client.date_launched ?? '',
    date_billed: client.date_billed ?? '',
    rebilling_date: client.rebilling_date ?? '',
    retainer_price: client.retainer_price != null ? String(client.retainer_price) : '',
    daily_ad_spend: String(client.daily_ad_spend ?? 0),
    ad_spend: String(client.ad_spend),
    next_checkin: client.next_checkin ?? '',
    contract_url: client.contract_url ?? '',
    ad_account_url: (client as any).ad_account_url ?? '',

    meta_ad_account_id: client.meta_ad_account_id ?? '',
    meta_access_token: client.meta_access_token ?? '',
    ghl_api_key: client.ghl_api_key ?? '',
    ghl_location_id: client.ghl_location_id ?? '',
    ghl_pipeline_id: client.ghl_pipeline_id ?? '',
    stage_leads: client.stage_leads ?? '',
    stage_contacted: client.stage_contacted ?? '',
    stage_unqualified: client.stage_unqualified ?? '',
    stage_phone: client.stage_phone ?? '',
    stage_inhome: client.stage_inhome ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(client.share_token ?? null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const [fetchingStages, setFetchingStages] = useState(false);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [stageError, setStageError] = useState('');

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Mirrors onboarding's "Fetch Stages" (app/admin/onboard/page.tsx), but for an
  // EXISTING client: resolves the API key server-side and reads whatever
  // Location ID/API key are currently typed here, even if not saved yet. This
  // is the fix for a real incident — StroTek's pipeline ID pointed at the wrong
  // pipeline for months because this modal had no way to verify an ID against
  // real GHL data, only raw text boxes.
  async function fetchGHLStages() {
    if (!form.ghl_location_id) {
      setStageError('Enter a Location ID first.');
      return;
    }
    setFetchingStages(true);
    setStageError('');
    setPipelines([]);
    try {
      const qs = new URLSearchParams();
      qs.set('locationId', form.ghl_location_id);
      if (form.ghl_api_key) qs.set('apiKey', form.ghl_api_key);
      const res = await fetch(`/api/clients/${client.id}/ghl/pipelines?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stages.');
      const fetched: GhlPipeline[] = data.pipelines;
      setPipelines(fetched);

      // Prefer the pipeline already saved if it's one of these; otherwise fall
      // back to the first, same as onboarding.
      const match = fetched.find((p) => p.id === form.ghl_pipeline_id) ?? fetched[0];
      if (match) {
        const updates: Record<string, string> = { ghl_pipeline_id: match.id };
        for (const s of match.stages) {
          const n = s.name.toLowerCase();
          if (!updates.stage_leads && (n.includes('new lead') || n.includes('new prospect') || n === 'lead')) updates.stage_leads = s.id;
          if (!updates.stage_contacted && (n.includes('contact') || n.includes('respond'))) updates.stage_contacted = s.id;
          if (!updates.stage_phone && (n.includes('phone') || n.includes('call') || n.includes('discovery'))) updates.stage_phone = s.id;
          if (!updates.stage_inhome && (n.includes('home') || n.includes('in person') || n.includes('quote') || n.includes('site'))) updates.stage_inhome = s.id;
          if (!updates.stage_unqualified && (n.includes('unqualified') || n.includes('disqualified') || n.includes('not a fit'))) updates.stage_unqualified = s.id;
        }
        setForm((f) => ({ ...f, ...updates }));
      }
    } catch (e: any) {
      setStageError(e.message || 'Failed to fetch stages. Check the Location ID and API key.');
    }
    setFetchingStages(false);
  }

  const shareUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/c/${shareToken}`
    : null;
  const selectedPipeline = pipelines.find((p) => p.id === form.ghl_pipeline_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        // Server also enforces this, but don't even send a value for a field
        // that was hidden from this admin
        retainer_price: canViewFinancials ? (Number(form.retainer_price) || 0) : undefined,
        ad_spend: Number(form.ad_spend) || 0,
        daily_ad_spend: Number(form.daily_ad_spend) || 0,
        next_checkin: form.next_checkin || null,
        date_launched: form.date_launched || null,
        date_billed: form.date_billed || null,
        rebilling_date: form.rebilling_date || null,
        meta_access_token: form.meta_access_token || null,
        meta_ad_account_id: form.meta_ad_account_id || null,
      }),
    });
    if (res.ok) onSaved(await res.json());
    setSaving(false);
  }

  async function generateToken() {
    setGeneratingToken(true);
    const res = await fetch(`/api/clients/${client.id}/token`, { method: 'POST' });
    if (res.ok) setShareToken((await res.json()).token);
    setGeneratingToken(false);
  }

  async function revokeToken() {
    await fetch(`/api/clients/${client.id}/token`, { method: 'DELETE' });
    setShareToken(null);
  }

  function copyLink() {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-lg p-6 my-8 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">Edit Client — {client.name}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:opacity-70"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Basics ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Client Name</Label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div>
              <Label>Start Date</Label>
              <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div>
              <Label>Ads Launch Date</Label>
              <input className="input" type="date" value={form.date_launched} onChange={(e) => set('date_launched', e.target.value)} />
            </div>
          </div>

          {/* ── Contact ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Contact (used for client login &amp; Whop billing match)</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Name</Label>
              <input className="input" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            </div>
            <div>
              <Label>Contact Email</Label>
              <input className="input" type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <input className="input" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
            </div>
            <div>
              <Label>Website</Label>
              <input className="input" value={form.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://…" />
            </div>
            <div className="col-span-2">
              <Label>Business Address <span className="font-normal opacity-70">(puts them on the Client Tracker map)</span></Label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, City, State ZIP" />
            </div>
          </div>

          {/* ── Billing ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Billing</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Retainer ($/mo)</Label>
              {canViewFinancials ? (
                <input className="input" type="number" min="0" value={form.retainer_price} onChange={(e) => set('retainer_price', e.target.value)} />
              ) : (
                <div className="input flex items-center" style={{ color: 'var(--text-muted)' }}>🔒 Only Jesse can view/edit this</div>
              )}
            </div>
            <div>
              <Label>Next Check-In Call</Label>
              <input className="input" type="datetime-local" value={form.next_checkin} onChange={(e) => set('next_checkin', e.target.value)} />
            </div>
            <div>
              <Label>Last Billed Date</Label>
              <input className="input" type="date" value={form.date_billed} onChange={(e) => set('date_billed', e.target.value)} />
            </div>
            <div>
              <Label>Rebilling Date</Label>
              <input className="input" type="date" value={form.rebilling_date} onChange={(e) => set('rebilling_date', e.target.value)} />
            </div>
          </div>

          {/* ── Ad Spend ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Ad Spend</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Daily Budget ($/day)</Label>
              <input className="input" type="number" min="0" step="0.01" value={form.daily_ad_spend} onChange={(e) => set('daily_ad_spend', e.target.value)} placeholder="e.g. 50" />
            </div>
            <div>
              <Label>Manual Total Override ($)</Label>
              <input className="input" type="number" min="0" value={form.ad_spend} onChange={(e) => set('ad_spend', e.target.value)} placeholder="Override total" />
            </div>
          </div>

          {/* ── Meta Ads ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Meta Ads (optional — auto-pulls spend)</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ad Account ID</Label>
              <input className="input" value={form.meta_ad_account_id} onChange={(e) => set('meta_ad_account_id', e.target.value)} placeholder="act_XXXXXXXXXX" />
            </div>
            <div>
              <Label>Access Token</Label>
              <input className="input" type="password" value={form.meta_access_token} onChange={(e) => set('meta_access_token', e.target.value)} placeholder="EAA…" />
            </div>
          </div>
          <MetaConnectionTest token={form.meta_access_token} adAccountId={form.meta_ad_account_id} clientId={client.id} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Use a <strong style={{ color: 'var(--text)' }}>System User</strong> token so it never expires: Meta Business Settings → Users → System users → add one → assign this ad account ("View performance") → Generate token (pick your app, tick <code>ads_read</code>, expiry <em>Never</em>). One System User can cover every client. A personal login token (e.g. from the Graph API Explorer) stops working after about 60 days.
          </p>

          {/* ── Resources ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Resources</SectionHeader>
          <div className="space-y-3">
            <div>
              <Label>Contract URL</Label>
              <input className="input" type="url" value={form.contract_url} onChange={(e) => set('contract_url', e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <Label>Ad Account Link (client can click to view their ad account)</Label>
              <input className="input" type="url" value={form.ad_account_url} onChange={(e) => set('ad_account_url', e.target.value)} placeholder="https://adsmanager.facebook.com/…" />
            </div>
          </div>

          {/* ── GHL ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Go High Level</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>GHL API Key (sub-account or leave blank for agency key)</Label>
              <input className="input" value={form.ghl_api_key} onChange={(e) => set('ghl_api_key', e.target.value)} placeholder="pit-…" />
            </div>
            <div className="col-span-2">
              <Label>Location ID</Label>
              <div className="flex gap-2">
                <input className="input flex-1" value={form.ghl_location_id} onChange={(e) => set('ghl_location_id', e.target.value)} />
                <button
                  type="button"
                  onClick={fetchGHLStages}
                  disabled={fetchingStages || !form.ghl_location_id}
                  className="btn-primary flex items-center gap-2 shrink-0"
                >
                  {fetchingStages ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {fetchingStages ? 'Fetching…' : 'Fetch Stages'}
                </button>
              </div>
              {stageError && <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>{stageError}</p>}
              {pipelines.length > 0 && !stageError && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--green)' }}>
                  <CheckCircle size={12} /> Found {pipelines.length} pipeline{pipelines.length === 1 ? '' : 's'} in this location — verify the picks below against real GHL names.
                </p>
              )}
            </div>
            <div>
              <Label>Pipeline ID {pipelines.length > 0 && <span className="font-normal opacity-70">(pick by name)</span>}</Label>
              {pipelines.length > 0 ? (
                <select className="input" value={form.ghl_pipeline_id} onChange={(e) => set('ghl_pipeline_id', e.target.value)}>
                  <option value="">— select —</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <input className="input" value={form.ghl_pipeline_id} onChange={(e) => set('ghl_pipeline_id', e.target.value)} />
              )}
            </div>
            <div />
            {[
              { key: 'stage_leads', label: 'New Lead' },
              { key: 'stage_contacted', label: 'Contacted' },
              { key: 'stage_phone', label: 'Booked Phone' },
              { key: 'stage_inhome', label: 'Booked In-Home' },
              { key: 'stage_unqualified', label: 'Unqualified' },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label>Stage — {label}</Label>
                {selectedPipeline ? (
                  <select className="input" value={(form as any)[key]} onChange={(e) => set(key, e.target.value)}>
                    <option value="">— not mapped —</option>
                    {selectedPipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input className="input" value={(form as any)[key]} onChange={(e) => set(key, e.target.value)} />
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>

        {/* ── Magic Link ── */}
        <hr className="my-5" style={{ borderColor: 'var(--border)' }} />
        <div>
          <p className="text-sm font-semibold flex items-center gap-2 mb-1">
            <Link2 size={14} style={{ color: 'var(--accent)' }} /> Client Share Link
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Private link your client can open — no login needed. Embeds in GHL sidebar via Custom Menu Links.
          </p>
          {shareToken && shareUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input className="input flex-1 text-xs" value={shareUrl} readOnly style={{ color: 'var(--text-muted)', fontSize: 12 }} />
                <button onClick={copyLink} className="btn-ghost flex items-center gap-1.5 shrink-0 text-sm">
                  {copied ? <><Check size={13} style={{ color: 'var(--green)' }} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
              <div className="flex gap-2">
                <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1.5 flex-1 justify-center">
                  Preview link
                </a>
                <button onClick={revokeToken} className="btn-ghost text-xs flex items-center gap-1.5" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                  <Trash2 size={12} /> Revoke
                </button>
              </div>
            </div>
          ) : (
            <button onClick={generateToken} className="btn-ghost w-full text-sm flex items-center justify-center gap-2" disabled={generatingToken}>
              <Link2 size={14} />
              {generatingToken ? 'Generating…' : 'Generate Share Link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

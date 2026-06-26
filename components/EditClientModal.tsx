'use client';
import { useState } from 'react';
import { Client } from '@/types';
import { X, Link2, Copy, Check, Trash2 } from 'lucide-react';

interface Props {
  client: Client;
  onClose: () => void;
  onSaved: (c: Client) => void;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{children}</label>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{children}</p>;
}

export default function EditClientModal({ client, onClose, onSaved }: Props) {
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
    retainer_price: String(client.retainer_price),
    daily_ad_spend: String(client.daily_ad_spend ?? 0),
    ad_spend: String(client.ad_spend),
    next_checkin: client.next_checkin ?? '',
    contract_url: client.contract_url ?? '',

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

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const shareUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/c/${shareToken}`
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        retainer_price: Number(form.retainer_price) || 0,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-lg p-6 my-4">
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

          {/* ── Billing ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Billing</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Retainer ($/mo)</Label>
              <input className="input" type="number" min="0" value={form.retainer_price} onChange={(e) => set('retainer_price', e.target.value)} />
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

          {/* ── Resources ── */}
          <hr style={{ borderColor: 'var(--border)' }} />
          <SectionHeader>Resources</SectionHeader>
          <div className="space-y-3">
            <div>
              <Label>Contract URL</Label>
              <input className="input" type="url" value={form.contract_url} onChange={(e) => set('contract_url', e.target.value)} placeholder="https://…" />
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
            <div>
              <Label>Location ID</Label>
              <input className="input" value={form.ghl_location_id} onChange={(e) => set('ghl_location_id', e.target.value)} />
            </div>
            <div>
              <Label>Pipeline ID</Label>
              <input className="input" value={form.ghl_pipeline_id} onChange={(e) => set('ghl_pipeline_id', e.target.value)} />
            </div>
            <div>
              <Label>Stage — New Lead</Label>
              <input className="input" value={form.stage_leads} onChange={(e) => set('stage_leads', e.target.value)} />
            </div>
            <div>
              <Label>Stage — Contacted</Label>
              <input className="input" value={form.stage_contacted} onChange={(e) => set('stage_contacted', e.target.value)} />
            </div>
            <div>
              <Label>Stage — Booked Phone</Label>
              <input className="input" value={form.stage_phone} onChange={(e) => set('stage_phone', e.target.value)} />
            </div>
            <div>
              <Label>Stage — Booked In-Home</Label>
              <input className="input" value={form.stage_inhome} onChange={(e) => set('stage_inhome', e.target.value)} />
            </div>
            <div>
              <Label>Stage — Unqualified</Label>
              <input className="input" value={form.stage_unqualified} onChange={(e) => set('stage_unqualified', e.target.value)} />
            </div>
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

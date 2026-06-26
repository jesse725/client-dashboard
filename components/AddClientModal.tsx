'use client';
import { useState } from 'react';
import { Client } from '@/types';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: (c: Client) => void;
}

export default function AddClientModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    start_date: new Date().toISOString().slice(0, 10),
    retainer_price: '',
    ad_spend: '',
    ghl_api_key: '',
    ghl_location_id: '',
    ghl_pipeline_id: '',
    stage_leads: '',
    stage_unqualified: '',
    stage_phone: '',
    stage_inhome: '',
    contract_url: '',
    slack_url: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        retainer_price: Number(form.retainer_price) || 0,
        ad_spend: Number(form.ad_spend) || 0,
      }),
    });
    if (res.ok) onCreated(await res.json());
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-lg p-6 my-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">Add New Client</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:opacity-70"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Client Name *</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Roofing" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Start Date *</label>
              <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Retainer ($/mo)</label>
              <input className="input" type="number" min="0" value={form.retainer_price} onChange={(e) => set('retainer_price', e.target.value)} placeholder="2500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Total Ad Spend ($)</label>
              <input className="input" type="number" min="0" value={form.ad_spend} onChange={(e) => set('ad_spend', e.target.value)} placeholder="5000" />
            </div>
          </div>

          <hr style={{ borderColor: 'var(--border)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Go High Level</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>GHL API Key</label>
              <input className="input" value={form.ghl_api_key} onChange={(e) => set('ghl_api_key', e.target.value)} placeholder="eyJ…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Location ID</label>
              <input className="input" value={form.ghl_location_id} onChange={(e) => set('ghl_location_id', e.target.value)} placeholder="loc_…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Pipeline ID</label>
              <input className="input" value={form.ghl_pipeline_id} onChange={(e) => set('ghl_pipeline_id', e.target.value)} placeholder="pip_…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Stage ID — Leads</label>
              <input className="input" value={form.stage_leads} onChange={(e) => set('stage_leads', e.target.value)} placeholder="stage_…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Stage ID — Unqualified</label>
              <input className="input" value={form.stage_unqualified} onChange={(e) => set('stage_unqualified', e.target.value)} placeholder="stage_…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Stage ID — Booked Phone</label>
              <input className="input" value={form.stage_phone} onChange={(e) => set('stage_phone', e.target.value)} placeholder="stage_…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Stage ID — Booked In-Home</label>
              <input className="input" value={form.stage_inhome} onChange={(e) => set('stage_inhome', e.target.value)} placeholder="stage_…" />
            </div>
          </div>

          <hr style={{ borderColor: 'var(--border)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Links</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Contract URL</label>
              <input className="input" type="url" value={form.contract_url} onChange={(e) => set('contract_url', e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Slack Channel URL</label>
              <input className="input" type="url" value={form.slack_url} onChange={(e) => set('slack_url', e.target.value)} placeholder="https://app.slack.com/…" />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </form>
      </div>
    </div>
  );
}

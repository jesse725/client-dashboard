'use client';
import { useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle } from 'lucide-react';
import { GHLPipeline } from '@/lib/ghl';

interface Props {
  client: { id: number; name: string };
  onClose: () => void;
  onSaved: () => void;
}

interface ClientDetail {
  ghl_pipeline_id: string | null;
  stage_leads: string | null;
  stage_unqualified: string | null;
  stage_phone: string | null;
  stage_inhome: string | null;
}

export default function StageMappingModal({ client, onClose, onSaved }: Props) {
  const [pipelines, setPipelines] = useState<GHLPipeline[]>([]);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [stages, setStages] = useState({
    leads: '',
    unqualified: '',
    phone: '',
    inhome: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const [pipRes, detailRes] = await Promise.all([
        fetch(`/api/clients/${client.id}/pipelines`),
        fetch(`/api/clients/${client.id}`),
      ]);
      const [pipes, det] = await Promise.all([pipRes.json(), detailRes.json()]);

      const pipeList: GHLPipeline[] = Array.isArray(pipes) ? pipes : [];
      setPipelines(pipeList);
      setDetail(det);

      const pid = det.ghl_pipeline_id ?? pipeList[0]?.id ?? '';
      setSelectedPipeline(pid);
      setStages({
        leads: det.stage_leads ?? '',
        unqualified: det.stage_unqualified ?? '',
        phone: det.stage_phone ?? '',
        inhome: det.stage_inhome ?? '',
      });
      setLoading(false);
    }
    load();
  }, [client.id]);

  const currentPipeline = pipelines.find(p => p.id === selectedPipeline);
  const stageOptions = currentPipeline?.stages ?? [];

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ghl_pipeline_id: selectedPipeline || null,
        stage_leads: stages.leads || null,
        stage_unqualified: stages.unqualified || null,
        stage_phone: stages.phone || null,
        stage_inhome: stages.inhome || null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { onSaved(); }, 800);
  }

  const FUNNEL_STEPS = [
    { key: 'leads' as const, label: 'Leads Generated', hint: 'First stage — new inbound leads' },
    { key: 'unqualified' as const, label: 'Unqualified', hint: 'Leads marked as not a fit' },
    { key: 'phone' as const, label: 'Booked Phone Call', hint: 'Phone / discovery call booked' },
    { key: 'inhome' as const, label: 'Booked In-Home', hint: 'In-home consultation booked' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-lg">Stage Mapping</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{client.name}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:opacity-70"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw size={20} className="animate-spin mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading pipelines from GHL…</p>
          </div>
        ) : pipelines.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No pipelines found. Make sure the agency API key has access to this location.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Pipeline selector */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Pipeline
              </label>
              <select
                className="input"
                value={selectedPipeline}
                onChange={(e) => {
                  setSelectedPipeline(e.target.value);
                  setStages({ leads: '', unqualified: '', phone: '', inhome: '' });
                }}
              >
                <option value="">— Select pipeline —</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Stage dropdowns */}
            {selectedPipeline && stageOptions.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Map pipeline stages to funnel steps
                </p>
                {FUNNEL_STEPS.map(({ key, label, hint }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                      {label}
                      <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{hint}</span>
                    </label>
                    <select
                      className="input"
                      value={stages[key]}
                      onChange={(e) => setStages(s => ({ ...s, [key]: e.target.value }))}
                    >
                      <option value="">— Not mapped —</option>
                      {stageOptions.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSave}
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={saving || saved || !selectedPipeline}
            >
              {saved
                ? <><CheckCircle size={14} /> Saved!</>
                : saving
                ? 'Saving…'
                : 'Save Mapping'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

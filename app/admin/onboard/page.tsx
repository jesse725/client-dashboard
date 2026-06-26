'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, Copy, Check, ExternalLink,
  Loader2, Search, ChevronRight,
} from 'lucide-react';

interface Stage { id: string; name: string; position: number; }
interface Pipeline { id: string; name: string; stages: Stage[]; }

const STEPS = ['Client Info', 'Ad Spend', 'GHL Setup', 'Meta Ads', 'Resources'];

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
      {children} {optional && <span className="text-xs font-normal opacity-60">(optional)</span>}
    </label>
  );
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{children}</p>;
}

export default function OnboardPageWrapper() {
  return (
    <Suspense>
      <OnboardPage />
    </Suspense>
  );
}

function OnboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillId = searchParams.get('prefill');
  const [step, setStep] = useState(0);
  const [prefillData, setPrefillData] = useState<any>(null);
  const [pendingClients, setPendingClients] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // GHL stage detection
  const [fetchingStages, setFetchingStages] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stageError, setStageError] = useState('');

  const [form, setForm] = useState({
    name: prefillData?.name ?? '',
    start_date: new Date().toISOString().slice(0, 10),
    date_launched: '',
    retainer_price: '',
    daily_ad_spend: '',
    date_billed: '',
    rebilling_date: '',
    next_checkin: '',
    ghl_api_key: '',
    ghl_location_id: '',
    ghl_pipeline_id: '',
    stage_leads: '',
    stage_contacted: '',
    stage_phone: '',
    stage_inhome: '',
    stage_unqualified: '',
    meta_ad_account_id: '',
    meta_access_token: '',
    contract_url: '',
    slack_url: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Load pending form submissions for the dropdown
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => setPendingClients((Array.isArray(data) ? data : []).filter((c: any) => c.onboard_status === 'pending')));
  }, []);

  // Pre-fill from URL param on load
  useEffect(() => {
    if (!prefillId) return;
    fetch(`/api/clients/${prefillId}`)
      .then(r => r.json())
      .then(data => applyPrefill(data));
  }, [prefillId]);

  function applyPrefill(data: any) {
    setPrefillData(data);
    setForm(f => ({ ...f, name: data.name ?? f.name }));
  }

  function handlePendingSelect(id: string) {
    if (!id) { setPrefillData(null); setForm(f => ({ ...f, name: '' })); return; }
    fetch(`/api/clients/${id}`)
      .then(r => r.json())
      .then(data => applyPrefill(data));
  }

  async function fetchGHLStages() {
    if (!form.ghl_api_key || !form.ghl_location_id) {
      setStageError('Enter both the GHL API key and Location ID first.');
      return;
    }
    setFetchingStages(true);
    setStageError('');
    setPipelines([]);
    try {
      const res = await fetch(`/api/ghl/pipelines?apiKey=${encodeURIComponent(form.ghl_api_key)}&locationId=${encodeURIComponent(form.ghl_location_id)}`);
      if (!res.ok) throw new Error(await res.text());
      const data: Pipeline[] = await res.json();
      setPipelines(data);

      // Auto-select first pipeline and fuzzy-map stages
      if (data.length > 0) {
        const p = data[0];
        set('ghl_pipeline_id', p.id);
        const updates: Record<string, string> = { ghl_pipeline_id: p.id };
        for (const s of p.stages) {
          const n = s.name.toLowerCase();
          if (!updates.stage_leads && (n.includes('new lead') || n.includes('new prospect') || n === 'lead')) updates.stage_leads = s.id;
          if (!updates.stage_contacted && (n.includes('contact') || n.includes('respond'))) updates.stage_contacted = s.id;
          if (!updates.stage_phone && (n.includes('phone') || n.includes('call') || n.includes('discovery'))) updates.stage_phone = s.id;
          if (!updates.stage_inhome && (n.includes('home') || n.includes('in person') || n.includes('quote') || n.includes('site'))) updates.stage_inhome = s.id;
          if (!updates.stage_unqualified && (n.includes('unqualified') || n.includes('disqualified') || n.includes('not a fit'))) updates.stage_unqualified = s.id;
        }
        setForm(f => ({ ...f, ...updates }));
      }
    } catch (e: any) {
      setStageError(e.message || 'Failed to fetch stages. Check your API key and Location ID.');
    }
    setFetchingStages(false);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        retainer_price: Number(form.retainer_price) || 0,
        daily_ad_spend: Number(form.daily_ad_spend) || 0,
        date_launched: form.date_launched || null,
        date_billed: form.date_billed || null,
        rebilling_date: form.rebilling_date || null,
        next_checkin: form.next_checkin || null,
        meta_access_token: form.meta_access_token || null,
        meta_ad_account_id: form.meta_ad_account_id || null,
        contract_url: form.contract_url || null,
        slack_url: form.slack_url || null,
      }),
    });
    if (res.ok) {
      setCreated(await res.json());
      // If this was a pending form submission, delete the placeholder now
      if (prefillId) {
        await fetch(`/api/clients/${prefillId}`, { method: 'DELETE' });
      }
    } else {
      alert('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const selectedPipeline = pipelines.find(p => p.id === form.ghl_pipeline_id);
  const shareUrl = created?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/c/${created.share_token}`
    : null;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (created) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <Link href="/admin" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> Admin
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold">Client Onboarded</span>
        </nav>

        <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
          {/* Success hero */}
          <div className="card p-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(34,197,94,0.15)' }}>
              <CheckCircle size={32} style={{ color: 'var(--green)' }} />
            </div>
            <h1 className="text-2xl font-bold mb-1">{created.name} is live</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Dashboard created · GHL stages mapped · Share link generated
            </p>
          </div>

          {/* Share link */}
          {shareUrl && (
            <div className="card p-6 space-y-3">
              <h2 className="font-semibold">Client Share Link</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Send this to the client or embed it in GHL's sidebar. No login required.
              </p>
              <div className="flex items-center gap-2">
                <input className="input flex-1 text-xs" value={shareUrl} readOnly style={{ fontSize: 12 }} />
                <button onClick={() => copy(shareUrl, 'share')} className="btn-ghost flex items-center gap-1.5 text-sm shrink-0">
                  {copied === 'share' ? <><Check size={13} style={{ color: 'var(--green)' }} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm flex items-center gap-1.5 w-fit">
                Preview dashboard <ExternalLink size={12} />
              </a>
            </div>
          )}

          {/* GHL sidebar instructions */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              Add to GHL Left Sidebar
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Follow these steps inside the client's GHL sub-account to add their dashboard as a permanent left-nav shortcut.
            </p>
            <ol className="space-y-4">
              {[
                { n: 1, title: 'Open the sub-account', body: `In GHL, switch to the ${created.name} sub-account.` },
                { n: 2, title: 'Go to Settings → Custom Menu Links', body: 'In the sub-account settings, find "Custom Menu Links" (sometimes listed under "Left Navigation" or "Custom Values").' },
                { n: 3, title: 'Add a new link', body: 'Click "+ Add Link". Set the name to "My Dashboard" (or whatever you want it to say in the sidebar).' },
                { n: 4, title: 'Paste the URL', body: 'Paste the share link below as the URL. Check "Open in iframe" so it loads inside GHL without leaving the app.' },
                { n: 5, title: 'Save and pin', body: 'Save the link. It will now appear in the client\'s GHL left sidebar permanently.' },
              ].map(({ n, title, body }) => (
                <li key={n} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{n}</div>
                  <div>
                    <p className="font-medium text-sm">{title}</p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            {shareUrl && (
              <div className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{shareUrl}</span>
                <button onClick={() => copy(shareUrl, 'ghl')} className="btn-ghost flex items-center gap-1.5 text-xs shrink-0">
                  {copied === 'ghl' ? <><Check size={11} style={{ color: 'var(--green)' }} /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link href={`/dashboard/${created.id}`} className="btn-primary flex-1 text-center text-sm py-2.5">
              Open Dashboard
            </Link>
            <button onClick={() => { setCreated(null); setStep(0); setForm(f => ({ ...f, name: '', ghl_api_key: '', ghl_location_id: '' })); }} className="btn-ghost flex-1 text-sm">
              Onboard Another Client
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <Link href="/admin" className="flex items-center gap-1.5 text-sm hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Admin
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="font-semibold">New Client Onboarding</span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Pending client picker */}
        <div className="card p-4 mb-6 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Who are you onboarding today?
            </label>
            <select
              className="input"
              defaultValue={prefillId ?? ''}
              onChange={e => handlePendingSelect(e.target.value)}
            >
              <option value="">— Select a form submission or start fresh —</option>
              {pendingClients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.contact_name ? ` · ${c.contact_name}` : ''}{c.contact_email ? ` (${c.contact_email})` : ''}
                </option>
              ))}
            </select>
          </div>
          {prefillData && (
            <div className="text-xs px-3 py-1.5 rounded-full font-medium shrink-0" style={{ background: 'rgba(108,99,255,0.15)', color: 'var(--accent)' }}>
              ✓ Pre-filled
            </div>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => i < step && setStep(i)}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: i === step ? 'var(--accent)' : i < step ? 'rgba(108,99,255,0.15)' : 'var(--surface-2)',
                  color: i === step ? 'white' : i < step ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: i < step ? 'pointer' : 'default',
                }}
              >
                {i < step ? <CheckCircle size={12} /> : <span className="w-4 text-center text-xs font-bold">{i + 1}</span>}
                {s}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} style={{ color: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div className="card p-6 space-y-5">

          {/* Step 0: Client Info */}
          {step === 0 && (
            <>
              <div>
                <h2 className="font-semibold text-lg mb-1">Client Info</h2>
                <SectionNote>Basic details about this client and when the relationship started.</SectionNote>
              </div>
              {/* Pre-filled data banner */}
              {prefillData && (
                <div className="rounded-lg p-4 text-sm space-y-1" style={{ background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)' }}>
                  <p className="font-semibold" style={{ color: 'var(--accent)' }}>📋 Pre-filled from Google Form submission</p>
                  {prefillData.contact_name && <p style={{ color: 'var(--text-muted)' }}>Contact: <span style={{ color: 'var(--text)' }}>{prefillData.contact_name}</span>{prefillData.contact_email ? ` · ${prefillData.contact_email}` : ''}{prefillData.contact_phone ? ` · ${prefillData.contact_phone}` : ''}</p>}
                  {prefillData.address && <p style={{ color: 'var(--text-muted)' }}>Address: <span style={{ color: 'var(--text)' }}>{prefillData.address}</span></p>}
                  {prefillData.ein && <p style={{ color: 'var(--text-muted)' }}>EIN: <span style={{ color: 'var(--text)' }}>{prefillData.ein}</span></p>}
                  {prefillData.target_locations && <p style={{ color: 'var(--text-muted)' }}>Target areas: <span style={{ color: 'var(--text)' }}>{prefillData.target_locations}</span></p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Client / Business Name</Label>
                  <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Smart Wire Systems" required />
                </div>
                <div>
                  <Label>Contract Start Date</Label>
                  <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                </div>
                <div>
                  <Label optional>Ads Launch Date</Label>
                  <input className="input" type="date" value={form.date_launched} onChange={e => set('date_launched', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Step 1: Ad Spend & Billing */}
          {step === 1 && (
            <>
              <div>
                <h2 className="font-semibold text-lg mb-1">Ad Spend & Billing</h2>
                <SectionNote>Set the retainer and ad budget. Daily spend is used to auto-calculate total spend over time.</SectionNote>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Retainer ($/month)</Label>
                  <input className="input" type="number" min="0" value={form.retainer_price} onChange={e => set('retainer_price', e.target.value)} placeholder="e.g. 1750" />
                </div>
                <div>
                  <Label>Daily Ad Budget ($/day)</Label>
                  <input className="input" type="number" min="0" step="0.01" value={form.daily_ad_spend} onChange={e => set('daily_ad_spend', e.target.value)} placeholder="e.g. 50" />
                </div>
                <div>
                  <Label optional>Last Billed Date</Label>
                  <input className="input" type="date" value={form.date_billed} onChange={e => set('date_billed', e.target.value)} />
                </div>
                <div>
                  <Label optional>Rebilling Date</Label>
                  <input className="input" type="date" value={form.rebilling_date} onChange={e => set('rebilling_date', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label optional>Next Check-In Call</Label>
                  <input className="input" type="datetime-local" value={form.next_checkin} onChange={e => set('next_checkin', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Step 2: GHL */}
          {step === 2 && (
            <>
              <div>
                <h2 className="font-semibold text-lg mb-1">Go High Level</h2>
                <SectionNote>Enter the sub-account API key and Location ID, then click Fetch Stages to auto-detect the pipeline.</SectionNote>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Sub-Account API Key</Label>
                  <input className="input" value={form.ghl_api_key} onChange={e => set('ghl_api_key', e.target.value)} placeholder="pit-…" />
                </div>
                <div className="col-span-2">
                  <Label>Location ID</Label>
                  <div className="flex gap-2">
                    <input className="input flex-1" value={form.ghl_location_id} onChange={e => set('ghl_location_id', e.target.value)} placeholder="e.g. ZJqSzUdBgcWGGCFcgQ3d" />
                    <button
                      type="button"
                      onClick={fetchGHLStages}
                      disabled={fetchingStages}
                      className="btn-primary flex items-center gap-2 shrink-0"
                    >
                      {fetchingStages ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      {fetchingStages ? 'Fetching…' : 'Fetch Stages'}
                    </button>
                  </div>
                  {stageError && <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>{stageError}</p>}
                </div>
              </div>

              {pipelines.length > 0 && (
                <div className="space-y-4">
                  <div className="h-px" style={{ background: 'var(--border)' }} />
                  <div>
                    <Label>Pipeline</Label>
                    <select className="input" value={form.ghl_pipeline_id} onChange={e => { set('ghl_pipeline_id', e.target.value); }}>
                      {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {selectedPipeline && (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'stage_leads', label: 'New Lead Stage' },
                        { key: 'stage_contacted', label: 'Contacted Stage' },
                        { key: 'stage_phone', label: 'Discovery Call Stage' },
                        { key: 'stage_inhome', label: 'In-Person Quote Stage' },
                        { key: 'stage_unqualified', label: 'Unqualified Stage' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <Label>{label}</Label>
                          <select className="input" value={(form as any)[key]} onChange={e => set(key, e.target.value)}>
                            <option value="">— not mapped —</option>
                            {selectedPipeline.stages.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--green)' }}>
                    <CheckCircle size={14} /> Stages detected — review mappings above and adjust if needed
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 3: Meta Ads */}
          {step === 3 && (
            <>
              <div>
                <h2 className="font-semibold text-lg mb-1">Meta Ads</h2>
                <SectionNote>Optional. Connect Meta Ads to automatically pull live ad spend, impressions, CTR, and CPL into the dashboard.</SectionNote>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label optional>Ad Account ID</Label>
                  <input className="input" value={form.meta_ad_account_id} onChange={e => set('meta_ad_account_id', e.target.value)} placeholder="act_XXXXXXXXXX or just the number" />
                </div>
                <div>
                  <Label optional>Access Token</Label>
                  <input className="input" type="password" value={form.meta_access_token} onChange={e => set('meta_access_token', e.target.value)} placeholder="EAA…" />
                </div>
              </div>
              <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <p className="font-medium" style={{ color: 'var(--text)' }}>How to get these:</p>
                <p>1. Ad Account ID — found in Meta Ads Manager URL or Business Settings → Ad Accounts</p>
                <p>2. Access Token — Meta Developers → Graph API Explorer → Generate Token with <code>ads_read</code> permission → extend to long-lived token</p>
              </div>
            </>
          )}

          {/* Step 4: Resources */}
          {step === 4 && (
            <>
              <div>
                <h2 className="font-semibold text-lg mb-1">Resources</h2>
                <SectionNote>Optional links shown on the dashboard for quick access.</SectionNote>
              </div>
              <div className="space-y-4">
                <div>
                  <Label optional>Contract URL</Label>
                  <input className="input" type="url" value={form.contract_url} onChange={e => set('contract_url', e.target.value)} placeholder="https://…" />
                </div>
                <div>
                  <Label optional>Slack Channel URL</Label>
                  <input className="input" type="url" value={form.slack_url} onChange={e => set('slack_url', e.target.value)} placeholder="https://app.slack.com/…" />
                </div>
              </div>

              {/* Review summary */}
              <div className="rounded-lg p-4 space-y-1.5 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p className="font-semibold mb-2">Ready to create</p>
                <p><span style={{ color: 'var(--text-muted)' }}>Client:</span> {form.name || '—'}</p>
                <p><span style={{ color: 'var(--text-muted)' }}>Start date:</span> {form.start_date}</p>
                <p><span style={{ color: 'var(--text-muted)' }}>Retainer:</span> ${form.retainer_price || 0}/mo</p>
                <p><span style={{ color: 'var(--text-muted)' }}>Daily ad spend:</span> ${form.daily_ad_spend || 0}/day</p>
                <p><span style={{ color: 'var(--text-muted)' }}>GHL location:</span> {form.ghl_location_id || '—'}</p>
                <p><span style={{ color: 'var(--text-muted)' }}>Pipeline stages mapped:</span> {[form.stage_leads, form.stage_contacted, form.stage_phone, form.stage_inhome, form.stage_unqualified].filter(Boolean).length} / 5</p>
                <p><span style={{ color: 'var(--text-muted)' }}>Meta Ads:</span> {form.meta_ad_account_id ? 'Connected' : 'Not connected'}</p>
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)} className="btn-ghost flex-1">
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 0 && !form.name.trim()) { alert('Client name is required.'); return; }
                  setStep(s => s + 1);
                }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !form.name.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create Client Dashboard'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

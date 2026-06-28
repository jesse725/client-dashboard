'use client';
import { useState, useEffect } from 'react';
import {
  PhoneCall, Rocket, CheckCircle, Plus, Trash2,
  ChevronDown, ChevronUp, FileText, Target, AlertCircle,
  Save, X, Star, ArrowRight, Smile,
} from 'lucide-react';

export interface IssueSolution { issue: string; solution: string; }

export interface CallNote {
  id: number;
  client_id: number;
  call_type: 'sales' | 'onboarding' | 'launch' | 'checkin';
  call_date: string;
  call_number: number;
  fathom_summary: string | null;
  pain_points: string | null;
  goals: string | null;
  solutions_tried: string | null;
  issues_solutions: IssueSolution[];
  // check-in specific
  problems_addressed: string | null;
  next_step_actions: string | null;
  problems_resolved: string | null;
  wins: string | null;
  client_sentiment: string | null;
  agency_action_items: string | null;
  client_action_items: string | null;
}

const CALL_TYPES = [
  { key: 'sales',      label: 'Strategy Call',  icon: <PhoneCall size={14} />,  color: '#6c63ff', desc: 'Initial discovery & qualification' },
  { key: 'onboarding', label: 'Onboarding Call', icon: <FileText size={14} />,   color: '#38bdf8', desc: 'Setup, expectations & kickoff' },
  { key: 'launch',     label: 'Launch Call',     icon: <Rocket size={14} />,     color: '#22c55e', desc: 'Ads live & campaign review' },
] as const;

const SENTIMENTS = ['😊 Happy', '😐 Neutral', '😟 Concerned', '🔥 Excited', '⚠️ At Risk'];

function Field({ label, value, onChange, placeholder, rows = 3, isAdmin, icon, iconColor }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; rows?: number; isAdmin: boolean;
  icon?: React.ReactNode; iconColor?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {icon && <span style={{ color: iconColor }}>{icon}</span>}
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</label>
      </div>
      {isAdmin ? (
        <textarea className="input w-full text-sm" rows={rows} value={value}
          onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
          style={{ resize: 'vertical', fontFamily: 'inherit' }} />
      ) : value ? (
        <p className="text-sm whitespace-pre-wrap leading-relaxed p-3 rounded-lg"
          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>{value}</p>
      ) : null}
    </div>
  );
}

// ── Strategy / Launch call card ─────────────────────────────────────────────
function StandardCallCard({ note, isAdmin, clientId, onSaved, onDeleted }: {
  note: CallNote; isAdmin: boolean; clientId: number;
  onSaved: (n: CallNote) => void; onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...note });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const ct = CALL_TYPES.find(t => t.key === note.call_type)!;

  function set<K extends keyof CallNote>(k: K, v: CallNote[K]) { setForm(f => ({ ...f, [k]: v })); setDirty(true); }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/calls/${note.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (res.ok) { onSaved(await res.json()); setDirty(false); }
    setSaving(false);
  }

  async function del() {
    if (!confirm('Delete this call note?')) return;
    await fetch(`/api/clients/${clientId}/calls/${note.id}`, { method: 'DELETE' });
    onDeleted(note.id);
  }

  const hasContent = note.fathom_summary || note.pain_points || note.goals || note.solutions_tried;

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:opacity-80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${ct.color}22`, color: ct.color }}>{ct.icon}</div>
          <div>
            <p className="font-semibold text-sm">{ct.label}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(note.call_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {!hasContent && isAdmin && <span className="ml-2 italic">· Click to fill in notes</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasContent && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ct.color}22`, color: ct.color }}>Notes added</span>}
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-4 space-y-5" style={{ borderColor: 'var(--border)' }}>
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Call Date</label>
              <input type="date" className="input text-sm" value={form.call_date} onChange={e => set('call_date', e.target.value)} />
            </div>
          )}

          {/* Fathom summary */}
          <Field label="Call Summary / Fathom Transcript" value={form.fathom_summary || ''}
            onChange={v => set('fathom_summary', v)}
            placeholder="Paste Fathom AI summary or key transcript notes here…"
            rows={5} isAdmin={isAdmin}
            icon={<FileText size={13} />} iconColor="var(--accent)" />

          {/* Strategy call extra fields */}
          {note.call_type === 'sales' && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Pain Points & Problems" value={form.pain_points || ''}
                  onChange={v => set('pain_points', v)}
                  placeholder="What challenges are they facing? What keeps them up at night?"
                  isAdmin={isAdmin} icon={<AlertCircle size={13} />} iconColor="#ef4444" />
                <Field label="Goals & Desires" value={form.goals || ''}
                  onChange={v => set('goals', v)}
                  placeholder="Revenue targets, lead volume, growth goals…"
                  isAdmin={isAdmin} icon={<Target size={13} />} iconColor="#22c55e" />
              </div>
              <Field label="Solutions Tried Before / Currently Trying" value={form.solutions_tried || ''}
                onChange={v => set('solutions_tried', v)}
                placeholder="Previous agencies, DIY ads, Google LSA, Angi Leads, referrals only…"
                isAdmin={isAdmin} icon={<Star size={13} />} iconColor="#f59e0b" />
            </>
          )}

          {isAdmin && (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={save} disabled={!dirty || saving}
                className="btn-primary text-sm flex items-center gap-2 flex-1 justify-center"
                style={{ opacity: dirty ? 1 : 0.4 }}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save Notes'}
              </button>
              <button onClick={del} className="btn-ghost text-sm flex items-center gap-2" style={{ color: 'var(--red)' }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Check-in card ────────────────────────────────────────────────────────────
function CheckInCard({ note, isAdmin, clientId, onSaved, onDeleted }: {
  note: CallNote; isAdmin: boolean; clientId: number;
  onSaved: (n: CallNote) => void; onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...note });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const color = '#f59e0b';

  function set<K extends keyof CallNote>(k: K, v: CallNote[K]) { setForm(f => ({ ...f, [k]: v })); setDirty(true); }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/calls/${note.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (res.ok) { onSaved(await res.json()); setDirty(false); }
    setSaving(false);
  }

  async function del() {
    if (!confirm('Delete this check-in?')) return;
    await fetch(`/api/clients/${clientId}/calls/${note.id}`, { method: 'DELETE' });
    onDeleted(note.id);
  }

  const hasContent = note.problems_addressed || note.wins || note.problems_resolved;

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${color}33`, background: 'var(--surface)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:opacity-80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}22`, color }}>
            <CheckCircle size={14} />
          </div>
          <div>
            <p className="font-semibold text-sm">Check-In #{note.call_number}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {new Date(note.call_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              {note.client_sentiment && (
                <span className="text-xs">{note.client_sentiment}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasContent && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>Notes added</span>}
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 pb-5 pt-4 space-y-5" style={{ borderColor: `${color}33` }}>

          {isAdmin && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Call Date</label>
                <input type="date" className="input text-sm" value={form.call_date} onChange={e => set('call_date', e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Client Sentiment</label>
                <select className="input text-sm" value={form.client_sentiment || ''}
                  onChange={e => set('client_sentiment', e.target.value)}>
                  <option value="">— Select —</option>
                  {SENTIMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Problems currently being addressed */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={13} style={{ color: '#ef4444' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#ef4444' }}>Problems Being Addressed</span>
            </div>
            <Field label="Current problems & what's being tackled" value={form.problems_addressed || ''}
              onChange={v => set('problems_addressed', v)}
              placeholder="What issues came up on this call? What are we actively working on?"
              rows={3} isAdmin={isAdmin} />
            <Field label="Next Step Actions" value={form.next_step_actions || ''}
              onChange={v => set('next_step_actions', v)}
              placeholder="Specific action items to address the problems above — who does what by when?"
              rows={3} isAdmin={isAdmin}
              icon={<ArrowRight size={12} />} iconColor="#f59e0b" />
          </div>

          {/* Resolved problems & wins */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={13} style={{ color: '#22c55e' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#22c55e' }}>Progress Since Last Call</span>
            </div>
            <Field label="Problems Resolved Since Last Call" value={form.problems_resolved || ''}
              onChange={v => set('problems_resolved', v)}
              placeholder="What issues from last time got fixed or improved?"
              rows={3} isAdmin={isAdmin} />
            <Field label="Wins & Results" value={form.wins || ''}
              onChange={v => set('wins', v)}
              placeholder="Revenue closed, leads generated, campaigns hitting targets, client milestones…"
              rows={3} isAdmin={isAdmin}
              icon={<Star size={12} />} iconColor="#f59e0b" />
          </div>

          {/* Action items */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Rocket size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Our Action Items</span>
              </div>
              <Field label="" value={form.agency_action_items || ''}
                onChange={v => set('agency_action_items', v)}
                placeholder="What does the agency need to deliver before next call?"
                rows={3} isAdmin={isAdmin} />
            </div>
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Smile size={13} style={{ color: '#38bdf8' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Client Action Items</span>
              </div>
              <Field label="" value={form.client_action_items || ''}
                onChange={v => set('client_action_items', v)}
                placeholder="What does the client need to do before next call?"
                rows={3} isAdmin={isAdmin} />
            </div>
          </div>

          {/* Fathom summary (collapsed by default for check-ins) */}
          <details>
            <summary className="text-xs cursor-pointer font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Full Call Summary / Fathom Transcript
            </summary>
            <div className="mt-2">
              <Field label="" value={form.fathom_summary || ''}
                onChange={v => set('fathom_summary', v)}
                placeholder="Paste Fathom AI summary or transcript…"
                rows={5} isAdmin={isAdmin} />
            </div>
          </details>

          {isAdmin && (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={save} disabled={!dirty || saving}
                className="btn-primary text-sm flex items-center gap-2 flex-1 justify-center"
                style={{ opacity: dirty ? 1 : 0.4 }}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save Check-In'}
              </button>
              <button onClick={del} className="btn-ghost text-sm flex items-center gap-2" style={{ color: 'var(--red)' }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CallNotesSection({ clientId, isAdmin }: { clientId: number; isAdmin: boolean }) {
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetch(`/api/clients/${clientId}/calls`)
      .then(r => r.json())
      .then(data => { setNotes(Array.isArray(data) ? data : []); setLoading(false); });
  }, [clientId]);

  async function addCall(type: string) {
    const res = await fetch(`/api/clients/${clientId}/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_type: type, call_date: addDate }),
    });
    if (res.ok) { const created = await res.json(); setNotes(n => [...n, created]); setAdding(null); }
  }

  const byType = (type: string) => notes.filter(n => n.call_type === type);

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading call notes…</div>;

  const checkins = byType('checkin');

  return (
    <div className="space-y-10">

      {/* ── Strategy / Onboarding / Launch ── */}
      {CALL_TYPES.map(ct => {
        const typeNotes = byType(ct.key);
        const canAdd = isAdmin && typeNotes.length === 0;

        return (
          <section key={ct.key}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${ct.color}22`, color: ct.color }}>{ct.icon}</div>
                <div>
                  <h3 className="font-semibold">{ct.label}</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ct.desc}</p>
                </div>
              </div>
              {canAdd && (
                adding === ct.key ? (
                  <div className="flex items-center gap-2">
                    <input type="date" className="input text-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
                    <button onClick={() => addCall(ct.key)} className="btn-primary text-sm px-3 py-1.5">Add</button>
                    <button onClick={() => setAdding(null)} className="btn-ghost text-sm px-3 py-1.5">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(ct.key)} className="btn-ghost text-sm flex items-center gap-1.5">
                    <Plus size={13} /> Add Notes
                  </button>
                )
              )}
            </div>
            <div className="space-y-3">
              {typeNotes.length === 0 ? (
                <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                  {isAdmin ? `No ${ct.label.toLowerCase()} notes yet — click Add Notes to get started.` : `Notes will appear here after your ${ct.label.toLowerCase()}.`}
                </div>
              ) : typeNotes.map(note => (
                <StandardCallCard key={note.id} note={note} isAdmin={isAdmin} clientId={clientId}
                  onSaved={u => setNotes(ns => ns.map(n => n.id === u.id ? u : n))}
                  onDeleted={id => setNotes(ns => ns.filter(n => n.id !== id))} />
              ))}
            </div>
          </section>
        );
      })}

      {/* ── Check-Ins (own section) ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              <CheckCircle size={14} />
            </div>
            <div>
              <h3 className="font-semibold">Check-In Calls</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ongoing progress, wins & action items · {checkins.length} recorded</p>
            </div>
          </div>
          {isAdmin && (
            adding === 'checkin' ? (
              <div className="flex items-center gap-2">
                <input type="date" className="input text-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
                <button onClick={() => addCall('checkin')} className="btn-primary text-sm px-3 py-1.5">Add Check-In</button>
                <button onClick={() => setAdding(null)} className="btn-ghost text-sm px-3 py-1.5">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAdding('checkin')} className="btn-ghost text-sm flex items-center gap-1.5">
                <Plus size={13} /> Add Check-In
              </button>
            )
          )}
        </div>

        <div className="space-y-3">
          {checkins.length === 0 ? (
            <div className="p-6 text-center text-sm rounded-xl" style={{ color: 'var(--text-muted)', border: '1px dashed rgba(245,158,11,0.3)' }}>
              {isAdmin ? 'No check-ins yet — add your first one above.' : 'Check-in notes will appear here after each call.'}
            </div>
          ) : checkins.map(note => (
            <CheckInCard key={note.id} note={note} isAdmin={isAdmin} clientId={clientId}
              onSaved={u => setNotes(ns => ns.map(n => n.id === u.id ? u : n))}
              onDeleted={id => setNotes(ns => ns.filter(n => n.id !== id))} />
          ))}
        </div>
      </section>

    </div>
  );
}

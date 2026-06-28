'use client';
import { useState, useEffect } from 'react';
import {
  PhoneCall, Rocket, Target, CheckCircle, Plus, Trash2,
  ChevronDown, ChevronUp, FileText, Lightbulb, AlertCircle, Save, X,
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
}

const CALL_TYPES = [
  { key: 'sales',      label: 'Sales Call',      icon: <PhoneCall size={14} />,  color: '#6c63ff', desc: 'Initial discovery & qualification' },
  { key: 'onboarding', label: 'Onboarding Call',  icon: <FileText size={14} />,   color: '#38bdf8', desc: 'Setup, expectations & kickoff' },
  { key: 'launch',     label: 'Launch Call',      icon: <Rocket size={14} />,     color: '#22c55e', desc: 'Ads live & campaign review' },
  { key: 'checkin',    label: 'Check-In Calls',   icon: <CheckCircle size={14} />,color: '#f59e0b', desc: 'Ongoing progress & issues' },
] as const;

function TextArea({ label, value, onChange, placeholder, isAdmin }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; isAdmin: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {isAdmin ? (
        <textarea
          className="input w-full text-sm"
          rows={3}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      ) : value ? (
        <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text)' }}>{value}</p>
      ) : (
        <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>Not yet filled in.</p>
      )}
    </div>
  );
}

function CallCard({
  note, isAdmin, clientId, onSaved, onDeleted,
}: {
  note: CallNote; isAdmin: boolean; clientId: number;
  onSaved: (n: CallNote) => void; onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...note });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function set<K extends keyof CallNote>(k: K, v: CallNote[K]) {
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
  }

  function addIssue() {
    set('issues_solutions', [...(form.issues_solutions || []), { issue: '', solution: '' }]);
  }

  function updateIssue(i: number, field: keyof IssueSolution, val: string) {
    const updated = (form.issues_solutions || []).map((item, idx) => idx === i ? { ...item, [field]: val } : item);
    set('issues_solutions', updated);
  }

  function removeIssue(i: number) {
    set('issues_solutions', (form.issues_solutions || []).filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/calls/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { onSaved(await res.json()); setDirty(false); }
    setSaving(false);
  }

  async function del() {
    if (!confirm('Delete this call note?')) return;
    await fetch(`/api/clients/${clientId}/calls/${note.id}`, { method: 'DELETE' });
    onDeleted(note.id);
  }

  const typeInfo = CALL_TYPES.find(t => t.key === note.call_type)!;
  const title = note.call_type === 'checkin' ? `Check-In #${note.call_number}` : typeInfo.label;

  const hasContent = note.fathom_summary || note.pain_points || note.goals || note.solutions_tried || note.issues_solutions?.length;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${typeInfo.color}22`, color: typeInfo.color }}>
            {typeInfo.icon}
          </div>
          <div>
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(note.call_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {!hasContent && isAdmin && <span className="ml-2 italic">· Click to fill in notes</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasContent && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${typeInfo.color}22`, color: typeInfo.color }}>
              Notes added
            </span>
          )}
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t px-4 pb-4 pt-4 space-y-5" style={{ borderColor: 'var(--border)' }}>

          {/* Date picker (admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Call Date</label>
              <input type="date" className="input text-sm" value={form.call_date}
                onChange={e => set('call_date', e.target.value)} />
            </div>
          )}

          {/* Fathom summary */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={13} style={{ color: 'var(--accent)' }} />
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Fathom Summary / Transcript
              </label>
            </div>
            {isAdmin ? (
              <textarea
                className="input w-full text-sm"
                rows={4}
                value={form.fathom_summary || ''}
                onChange={e => set('fathom_summary', e.target.value)}
                placeholder="Paste Fathom AI summary or key transcript notes here…"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            ) : form.fathom_summary ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed p-3 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>{form.fathom_summary}</p>
            ) : null}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Pain points */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={13} style={{ color: '#ef4444' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Pain Points & Problems</span>
              </div>
              <TextArea
                label="" value={form.pain_points || ''}
                onChange={v => set('pain_points', v)}
                placeholder="What challenges are they facing? What keeps them up at night?"
                isAdmin={isAdmin}
              />
            </div>

            {/* Goals */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target size={13} style={{ color: '#22c55e' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Goals & Desires</span>
              </div>
              <TextArea
                label="" value={form.goals || ''}
                onChange={v => set('goals', v)}
                placeholder="What do they want to achieve? Revenue targets, lead volume, growth goals…"
                isAdmin={isAdmin}
              />
            </div>
          </div>

          {/* Solutions tried */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb size={13} style={{ color: '#f59e0b' }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Solutions Tried Before / Currently Trying</span>
            </div>
            <TextArea
              label="" value={form.solutions_tried || ''}
              onChange={v => set('solutions_tried', v)}
              placeholder="Previous agencies, DIY ads, Google LSA, Angi Leads, referrals only…"
              isAdmin={isAdmin}
            />
          </div>

          {/* Issues & Solutions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={13} style={{ color: '#6c63ff' }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  {note.call_type === 'checkin' ? 'Issues Raised & Solutions' : 'Objections & Responses'}
                </span>
              </div>
              {isAdmin && (
                <button onClick={addIssue} className="text-xs flex items-center gap-1 hover:opacity-70" style={{ color: 'var(--accent)' }}>
                  <Plus size={11} /> Add
                </button>
              )}
            </div>

            {(form.issues_solutions || []).length === 0 && !isAdmin && (
              <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>None recorded.</p>
            )}

            {(form.issues_solutions || []).map((item, i) => (
              <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: '#ef4444' }}>Issue</span>
                  {isAdmin ? (
                    <input className="input flex-1 text-sm" value={item.issue}
                      onChange={e => updateIssue(i, 'issue', e.target.value)}
                      placeholder="What problem or concern came up?" />
                  ) : (
                    <p className="text-sm flex-1">{item.issue}</p>
                  )}
                  {isAdmin && (
                    <button onClick={() => removeIssue(i)} className="shrink-0 hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: '#22c55e' }}>Solution</span>
                  {isAdmin ? (
                    <input className="input flex-1 text-sm" value={item.solution}
                      onChange={e => updateIssue(i, 'solution', e.target.value)}
                      placeholder="How did you address it?" />
                  ) : (
                    <p className="text-sm flex-1">{item.solution}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Save / Delete (admin only) */}
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
    if (res.ok) {
      const created = await res.json();
      setNotes(n => [...n, created]);
      setAdding(null);
    }
  }

  const byType = (type: string) => notes.filter(n => n.call_type === type);

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading call notes…</div>;

  return (
    <div className="space-y-8">
      {CALL_TYPES.map(ct => {
        const typeNotes = byType(ct.key);
        const canAddMultiple = ct.key === 'checkin';
        const canAdd = isAdmin && (canAddMultiple || typeNotes.length === 0);

        return (
          <section key={ct.key}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${ct.color}22`, color: ct.color }}>
                  {ct.icon}
                </div>
                <div>
                  <h3 className="font-semibold">{ct.label}</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ct.desc}</p>
                </div>
              </div>
              {canAdd && (
                adding === ct.key ? (
                  <div className="flex items-center gap-2">
                    <input type="date" className="input text-sm" value={addDate}
                      onChange={e => setAddDate(e.target.value)} />
                    <button onClick={() => addCall(ct.key)} className="btn-primary text-sm px-3 py-1.5">Add</button>
                    <button onClick={() => setAdding(null)} className="btn-ghost text-sm px-3 py-1.5">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(ct.key)}
                    className="btn-ghost text-sm flex items-center gap-1.5">
                    <Plus size={13} /> {typeNotes.length === 0 ? 'Add Notes' : 'Add Check-In'}
                  </button>
                )
              )}
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {typeNotes.length === 0 ? (
                <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                  {isAdmin ? `No ${ct.label.toLowerCase()} notes yet — click Add Notes to get started.` : `Notes will appear here after your ${ct.label.toLowerCase()}.`}
                </div>
              ) : (
                typeNotes.map(note => (
                  <CallCard
                    key={note.id}
                    note={note}
                    isAdmin={isAdmin}
                    clientId={clientId}
                    onSaved={updated => setNotes(ns => ns.map(n => n.id === updated.id ? updated : n))}
                    onDeleted={id => setNotes(ns => ns.filter(n => n.id !== id))}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

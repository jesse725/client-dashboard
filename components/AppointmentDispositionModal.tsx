'use client';
import { useEffect, useState } from 'react';
import { Quote } from '@/types';
import { X, Trash2 } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stageId: string;
  createdAt: string;
}

interface Props {
  clientId: string;
  quote: Quote | null;
  onClose: () => void;
  onSaved: (q: Quote) => void;
  onDeleted: (id: number) => void;
}

const OUTCOMES = [
  { key: 'closed_won',      label: 'Closed — Won',                status: 'closed' },
  { key: 'proposal_sent',   label: 'Proposal Sent — Follow Up',    status: 'open' },
  { key: 'rescheduled',     label: 'Rescheduled',                  status: 'open' },
  { key: 'no_show',         label: 'No Show',                      status: 'open' },
  { key: 'not_interested',  label: 'Not Interested — Lost',        status: 'lost' },
] as const;

function guessOutcomeKey(quote: Quote | null): string {
  if (!quote) return 'proposal_sent';
  const known = OUTCOMES.find(o => quote.notes?.startsWith(o.label));
  if (known) return known.key;
  if (quote.status === 'closed') return 'closed_won';
  if (quote.status === 'lost') return 'not_interested';
  return 'proposal_sent';
}

function stripOutcomePrefix(quote: Quote | null): string {
  if (!quote?.notes) return '';
  const known = OUTCOMES.find(o => quote.notes?.startsWith(o.label));
  if (!known) return quote.notes;
  return quote.notes.slice(known.label.length).replace(/^\s*—\s*/, '');
}

export default function AppointmentDispositionModal({ clientId, quote, onClose, onSaved, onDeleted }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(!quote);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [manualEntry, setManualEntry] = useState(!!quote);

  const [form, setForm] = useState({
    customer_name: quote?.customer_name ?? '',
    outcome: guessOutcomeKey(quote),
    value: quote?.value ?? 0,
    notes: stripOutcomePrefix(quote),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (quote) return; // editing — no need to fetch leads
    (async () => {
      const res = await fetch(`/api/clients/${clientId}/leads`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads ?? []);
        if (!data.leads || data.leads.length === 0) setManualEntry(true);
      } else {
        setManualEntry(true);
      }
      setLoadingLeads(false);
    })();
  }, [clientId, quote]);

  function pickLead(leadId: string) {
    setSelectedLeadId(leadId);
    const lead = leads.find(l => l.id === leadId);
    if (lead) set('customer_name', lead.name);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const outcome = OUTCOMES.find(o => o.key === form.outcome)!;
    const notes = form.notes.trim() ? `${outcome.label} — ${form.notes.trim()}` : outcome.label;

    const url = quote
      ? `/api/clients/${clientId}/quotes/${quote.id}`
      : `/api/clients/${clientId}/quotes`;
    const method = quote ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: form.customer_name,
        value: Number(form.value) || 0,
        status: outcome.status,
        notes,
      }),
    });

    if (res.ok) {
      onSaved(await res.json());
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!quote) return;
    setDeleting(true);
    await fetch(`/api/clients/${clientId}/quotes/${quote.id}`, { method: 'DELETE' });
    onDeleted(quote.id);
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-md p-6 my-8 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">{quote ? 'Edit Disposition' : 'Disposition Appointment'}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!quote && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Which Lead</label>
              {loadingLeads ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading leads…</p>
              ) : !manualEntry ? (
                <>
                  <select
                    className="input"
                    value={selectedLeadId}
                    onChange={(e) => pickLead(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select a lead…</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}{l.email ? ` (${l.email})` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setManualEntry(true)}
                    className="text-xs mt-1.5 hover:opacity-70" style={{ color: 'var(--accent)' }}>
                    Can't find them? Enter manually
                  </button>
                </>
              ) : (
                <>
                  <input className="input" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)}
                    placeholder="Customer name" required />
                  {leads.length > 0 && (
                    <button type="button" onClick={() => setManualEntry(false)}
                      className="text-xs mt-1.5 hover:opacity-70" style={{ color: 'var(--accent)' }}>
                      Pick from lead list instead
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {quote && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Lead</label>
              <input className="input" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} required />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>What Happened</label>
            <select className="input" value={form.outcome} onChange={(e) => set('outcome', e.target.value)}>
              {OUTCOMES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Value of Project ($)</label>
            <input className="input" type="number" min="0" step="0.01" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="0" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Additional Notes (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Any other details…" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : quote ? 'Save Changes' : 'Save Disposition'}
            </button>
            {quote && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="btn-ghost flex items-center gap-1.5"
                style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
              >
                <Trash2 size={14} /> {deleting ? '…' : 'Delete'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

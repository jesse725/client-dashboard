'use client';
import { useState } from 'react';
import { Quote } from '@/types';
import { X, Trash2 } from 'lucide-react';

interface Props {
  clientId: string;
  quote: Quote | null;
  onClose: () => void;
  onSaved: (q: Quote) => void;
  onDeleted: (id: number) => void;
}

export default function QuoteModal({ clientId, quote, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState({
    customer_name: quote?.customer_name ?? '',
    value: quote?.value ?? 0,
    status: quote?.status ?? 'open',
    drive_url: quote?.drive_url ?? '',
    notes: quote?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const url = quote
      ? `/api/clients/${clientId}/quotes/${quote.id}`
      : `/api/clients/${clientId}/quotes`;
    const method = quote ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, value: Number(form.value) }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">{quote ? 'Edit Quote' : 'Add Quote'}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Customer Name</label>
            <input className="input" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="John Smith" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Quote Value ($)</label>
            <input className="input" type="number" min="0" step="0.01" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="0" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</label>
            <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="open">Open</option>
              <option value="closed">Closed (Won)</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Google Drive Link (optional)</label>
            <input className="input" type="url" value={form.drive_url} onChange={(e) => set('drive_url', e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Any additional details…" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : quote ? 'Save Changes' : 'Add Quote'}
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

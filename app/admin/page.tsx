'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, X, RefreshCw, CheckCircle, AlertCircle,
  Clock, Settings2, Key, Users, ChevronDown, FileInput, Copy, ExternalLink, BarChart2, TrendingUp,
} from 'lucide-react';
import StageMappingModal from '@/components/StageMappingModal';

interface UserRow { id: number; email: string; name: string; role: string; client_id: number | null }
interface ClientOption { id: number; name: string; ghl_location_id: string | null }
interface PendingClient {
  id: number; name: string; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; address: string | null; ein: string | null;
  target_locations: string | null; created_at: string;
}
interface SyncLog {
  id: number; started_at: string; finished_at: string | null;
  status: 'running' | 'success' | 'error';
  locations_found: number; clients_created: number; clients_updated: number;
  error_message: string | null;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [agencyKey, setAgencyKey] = useState('');
  const [agencyKeyInput, setAgencyKeyInput] = useState('');
  const [syncInterval, setSyncInterval] = useState('30');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ email: '', name: '', password: '', role: 'client', client_id: '' });
  const [savingUser, setSavingUser] = useState(false);
  const [mappingClient, setMappingClient] = useState<ClientOption | null>(null);
  const [pendingClients, setPendingClients] = useState<PendingClient[]>([]);
  const [activeTab, setActiveTab] = useState<'sync' | 'users' | 'forms'>('sync');
  const [copied, setCopied] = useState(false);

  const user = session?.user as any;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role !== 'admin') router.push('/dashboard');
  }, [status, user, router]);

  const loadData = useCallback(async () => {
    if (status !== 'authenticated') return;
    const [ur, cr, sr, settingsR] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/clients'),
      fetch('/api/sync'),
      fetch('/api/settings'),
    ]);
    const [u, c, s, settings] = await Promise.all([ur.json(), cr.json(), sr.json(), settingsR.json()]);
    setUsers(u);
    const allClients = Array.isArray(c) ? c : [];
    setClients(allClients.filter((x: any) => x.onboard_status !== 'pending'));
    setPendingClients(allClients.filter((x: any) => x.onboard_status === 'pending'));
    setSyncLogs(s.logs ?? []);
    setLastSync(s.lastSync ?? null);
    setAgencyKey(settings.ghl_agency_key ?? '');
    setSyncInterval(settings.sync_interval_minutes ?? '30');
  }, [status]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-sync timer
  useEffect(() => {
    const mins = parseInt(syncInterval) || 30;
    const timer = setInterval(async () => {
      await fetch('/api/sync', { method: 'POST' });
      loadData();
    }, mins * 60 * 1000);
    return () => clearInterval(timer);
  }, [syncInterval, loadData]);

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ghl_agency_key: agencyKeyInput, sync_interval_minutes: syncInterval }),
    });
    setAgencyKeyInput('');
    await loadData();
    setSavingKey(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    setSyncResult({ created: data.clientsCreated, updated: data.clientsUpdated, errors: data.errors ?? [] });
    await loadData();
    setSyncing(false);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSavingUser(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...userForm, client_id: userForm.client_id ? Number(userForm.client_id) : null }),
    });
    if (res.ok) {
      const newUser = await res.json();
      setUsers((prev) => [...prev, newUser]);
      setShowUserForm(false);
      setUserForm({ email: '', name: '', password: '', role: 'client', client_id: '' });
    }
    setSavingUser(false);
  }

  const setUF = (k: string, v: string) => setUserForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="font-semibold flex items-center gap-2"><Settings2 size={16} style={{ color: 'var(--accent)' }} /> Admin Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/tracker" className="btn-ghost text-sm flex items-center gap-2">
            <BarChart2 size={14} /> Client Tracker
          </Link>
          <Link href="/admin/sales" className="btn-ghost text-sm flex items-center gap-2">
            <TrendingUp size={14} /> Sales Tracker
          </Link>
          <Link href="/admin/onboard" className="btn-primary text-sm flex items-center gap-2">
            <Plus size={14} /> Onboard Client
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit" style={{ background: 'var(--surface)' }}>
          {(['sync', 'forms', 'users'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors relative"
              style={{
                background: activeTab === tab ? 'var(--accent)' : 'transparent',
                color: activeTab === tab ? 'white' : 'var(--text-muted)',
              }}>
              {tab === 'sync' && <span className="flex items-center gap-1.5"><RefreshCw size={13} /> GHL Sync</span>}
              {tab === 'forms' && (
                <span className="flex items-center gap-1.5">
                  <FileInput size={13} /> Form Submissions
                  {pendingClients.length > 0 && (
                    <span className="ml-1 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold"
                      style={{ background: activeTab === 'forms' ? 'white' : 'var(--accent)', color: activeTab === 'forms' ? 'var(--accent)' : 'white' }}>
                      {pendingClients.length}
                    </span>
                  )}
                </span>
              )}
              {tab === 'users' && <span className="flex items-center gap-1.5"><Users size={13} /> Users</span>}
            </button>
          ))}
        </div>

        {/* ── GHL SYNC TAB ────────────────────────────────────────────── */}
        {activeTab === 'sync' && (
          <div className="space-y-6">

            {/* Agency Key */}
            <div className="card p-6">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Key size={16} style={{ color: 'var(--accent)' }} /> Agency API Key</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                Your GHL agency-level key. Found in GHL → Settings → Integrations → API Keys.
              </p>
              <form onSubmit={handleSaveKey} className="flex gap-3">
                <input
                  className="input flex-1"
                  type="password"
                  value={agencyKeyInput}
                  onChange={(e) => setAgencyKeyInput(e.target.value)}
                  placeholder={agencyKey ? 'Enter new key to replace current one' : 'Paste your GHL Agency API key…'}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Sync every (mins)</label>
                  <input
                    className="input w-24"
                    type="number"
                    min="5"
                    max="1440"
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary self-end" disabled={savingKey}>
                  {savingKey ? 'Saving…' : 'Save'}
                </button>
              </form>
              {agencyKey && (
                <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--green)' }}>
                  <CheckCircle size={12} /> Agency key is configured
                </p>
              )}
            </div>

            {/* Sync Control */}
            <div className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold mb-1 flex items-center gap-2">
                    <RefreshCw size={16} style={{ color: 'var(--accent)' }} /> Sync Sub-Accounts
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Pulls all GHL sub-accounts, creates missing client records, and auto-maps pipeline stages.
                  </p>
                  {lastSync && (
                    <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={11} /> Last sync: {new Date(lastSync).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSync}
                  className="btn-primary flex items-center gap-2"
                  disabled={syncing || !agencyKey}
                >
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </button>
              </div>

              {syncResult && (
                <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-sm font-medium mb-2">Last sync result</p>
                  <div className="flex gap-4 text-sm">
                    <span style={{ color: 'var(--green)' }}>+{syncResult.created} new clients</span>
                    <span style={{ color: 'var(--accent)' }}>{syncResult.updated} updated</span>
                    {syncResult.errors.length > 0 && (
                      <span style={{ color: 'var(--red)' }}>{syncResult.errors.length} errors</span>
                    )}
                  </div>
                  {syncResult.errors.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {syncResult.errors.map((e, i) => (
                        <li key={i} className="text-xs flex items-start gap-1" style={{ color: 'var(--red)' }}>
                          <AlertCircle size={11} className="mt-0.5 shrink-0" /> {e}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Stage Mapping per client */}
            <div className="card p-6">
              <h2 className="font-semibold mb-1">Pipeline Stage Mapping</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                For each client, choose which GHL pipeline stages map to each funnel step.
                Auto-mapped on sync — click a client to review or adjust.
              </p>
              <div className="space-y-2">
                {clients.filter(c => c.ghl_location_id).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setMappingClient(c)}
                    className="w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors hover:bg-[var(--surface-2)]"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs" style={{ background: 'var(--accent)' }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{c.name}</span>
                    </div>
                    <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
                {clients.filter(c => c.ghl_location_id).length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
                    No GHL-linked clients yet. Run a sync first.
                  </p>
                )}
              </div>
            </div>

            {/* Sync Log */}
            {syncLogs.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <h2 className="font-medium text-sm">Sync History</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      {['Time', 'Status', 'Locations', 'Created', 'Updated'].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: i < syncLogs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                          {new Date(log.started_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{
                            background: log.status === 'success' ? 'rgba(34,197,94,0.12)' : log.status === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(108,99,255,0.12)',
                            color: log.status === 'success' ? 'var(--green)' : log.status === 'error' ? 'var(--red)' : 'var(--accent)',
                          }}>
                            {log.status === 'success' ? <CheckCircle size={10} /> : log.status === 'error' ? <AlertCircle size={10} /> : <RefreshCw size={10} />}
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">{log.locations_found}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--green)' }}>+{log.clients_created}</td>
                        <td className="px-4 py-2.5">{log.clients_updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FORM SUBMISSIONS TAB ────────────────────────────────────── */}
        {activeTab === 'forms' && (
          <div className="space-y-6">

            {/* Webhook setup card */}
            <div className="card p-6">
              <h2 className="font-semibold mb-1 flex items-center gap-2">
                <FileInput size={16} style={{ color: 'var(--accent)' }} /> Google Forms Webhook Setup
              </h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                Paste this Google Apps Script into your form's script editor. Every new submission will instantly create a pending client record here.
              </p>

              {/* Webhook URL */}
              <div className="mb-4">
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Your Webhook URL</label>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs px-3 py-2 rounded-lg font-mono" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/google-form
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/google-form`);
                      setCopied(true); setTimeout(() => setCopied(false), 2000);
                    }}
                    className="btn-ghost text-sm flex items-center gap-1.5">
                    <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Apps Script */}
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Google Apps Script — paste in your form's script editor</label>
              <pre className="text-xs p-4 rounded-lg overflow-x-auto leading-relaxed" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>{`const WEBHOOK_URL = "${typeof window !== 'undefined' ? window.location.origin : 'https://YOUR-DOMAIN'}/api/webhooks/google-form";
const WEBHOOK_SECRET = ""; // Set this to your WEBHOOK_SECRET env var value

function onFormSubmit(e) {
  const r = e.response.getItemResponses();
  const get = (label) => {
    const item = r.find(i => i.getItem().getTitle().toLowerCase().includes(label.toLowerCase()));
    return item ? item.getResponse() : "";
  };

  const payload = {
    business_name:     get("business name"),
    contact_name:      get("contact name") || get("your name") || get("owner name"),
    contact_email:     get("email"),
    contact_phone:     get("phone"),
    address:           get("address"),
    ein:               get("ein") || get("tax id"),
    target_locations:  get("target location") || get("service area") || get("cities"),
  };

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "x-webhook-secret": WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}`}</pre>
              <div className="mt-3 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
                <p>1. In Google Forms → ⋮ menu → Script editor → paste the code above</p>
                <p>2. Set <code className="px-1 rounded" style={{ background: 'var(--surface-2)' }}>WEBHOOK_SECRET</code> to match the <code className="px-1 rounded" style={{ background: 'var(--surface-2)' }}>WEBHOOK_SECRET</code> env var in Railway</p>
                <p>3. Click Triggers → Add Trigger → <strong>onFormSubmit</strong> → On form submit → Save</p>
                <p>4. Update the <code className="px-1 rounded" style={{ background: 'var(--surface-2)' }}>get()</code> labels to match your exact form question titles</p>
              </div>
            </div>

            {/* Pending submissions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Pending Submissions ({pendingClients.length})</h2>
              </div>
              {pendingClients.length === 0 ? (
                <div className="card p-10 text-center">
                  <FileInput size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No form submissions yet. Once a client fills out the form, they'll appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingClients.map((p) => (
                    <div key={p.id} className="card p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0"
                              style={{ background: 'var(--accent)' }}>
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold truncate">{p.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                              style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--yellow)' }}>
                              pending setup
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm pl-9">
                            {p.contact_name && <span style={{ color: 'var(--text-muted)' }}>👤 {p.contact_name}</span>}
                            {p.contact_email && <span style={{ color: 'var(--text-muted)' }}>✉ {p.contact_email}</span>}
                            {p.contact_phone && <span style={{ color: 'var(--text-muted)' }}>📞 {p.contact_phone}</span>}
                            {p.address && <span style={{ color: 'var(--text-muted)' }}>📍 {p.address}</span>}
                            {p.ein && <span style={{ color: 'var(--text-muted)' }}>🏢 EIN: {p.ein}</span>}
                            {p.target_locations && <span style={{ color: 'var(--text-muted)' }}>🎯 {p.target_locations}</span>}
                          </div>
                          <p className="text-xs pl-9" style={{ color: 'var(--text-muted)' }}>
                            Submitted {new Date(p.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Link
                          href={`/admin/onboard?prefill=${p.id}`}
                          className="btn-primary text-sm flex items-center gap-2 shrink-0"
                        >
                          <ExternalLink size={13} /> Complete Setup
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── USERS TAB ───────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Team & Client Logins</h2>
              <button onClick={() => setShowUserForm(true)} className="btn-primary text-sm flex items-center gap-2">
                <Plus size={14} /> Add User
              </button>
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    {['Name', 'Email', 'Role', 'Client'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                          background: u.role === 'admin' ? 'rgba(108,99,255,0.15)' : 'rgba(34,197,94,0.12)',
                          color: u.role === 'admin' ? 'var(--accent)' : 'var(--green)',
                        }}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                        {u.client_id ? clients.find(c => c.id === u.client_id)?.name ?? `ID ${u.client_id}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showUserForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-lg">Add User</h2>
              <button onClick={() => setShowUserForm(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Name</label>
                <input className="input" value={userForm.name} onChange={(e) => setUF('name', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                <input className="input" type="email" value={userForm.email} onChange={(e) => setUF('email', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                <input className="input" type="password" value={userForm.password} onChange={(e) => setUF('password', e.target.value)} required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Role</label>
                <select className="input" value={userForm.role} onChange={(e) => setUF('role', e.target.value)}>
                  <option value="admin">Admin (team)</option>
                  <option value="client">Client</option>
                </select>
              </div>
              {userForm.role === 'client' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Assign to Client</label>
                  <select className="input" value={userForm.client_id} onChange={(e) => setUF('client_id', e.target.value)}>
                    <option value="">— Select client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={savingUser}>
                {savingUser ? 'Creating…' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Stage Mapping Modal */}
      {mappingClient && (
        <StageMappingModal
          client={mappingClient}
          onClose={() => setMappingClient(null)}
          onSaved={() => { setMappingClient(null); loadData(); }}
        />
      )}
    </div>
  );
}

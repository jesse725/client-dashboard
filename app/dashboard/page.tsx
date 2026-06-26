'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Client } from '@/types';
import { calcMonthsWorked } from '@/lib/metrics';
import { Users, TrendingUp, Plus, Settings } from 'lucide-react';
import AddClientModal from '@/components/AddClientModal';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const user = session?.user as any;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          if (data.length === 1 && user?.role === 'client') {
            router.push(`/dashboard/${data[0].id}`);
          } else {
            setClients(data);
          }
        }
        setLoading(false);
      });
  }, [status, user?.role, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--accent)' }}>M</div>
          <span className="font-semibold">Merova Media</span>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <Link href="/admin" className="btn-ghost text-sm flex items-center gap-2">
              <Settings size={14} /> Admin
            </Link>
          )}
          <button
            onClick={() => router.push('/api/auth/signout')}
            className="btn-ghost text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">All Clients</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {clients.length} active {clients.length === 1 ? 'client' : 'clients'}
            </p>
          </div>
          {user?.role === 'admin' && (
            <Link href="/admin/onboard" className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={14} /> Onboard Client
            </Link>
          )}
        </div>

        {clients.length === 0 ? (
          <div className="card p-12 text-center">
            <Users size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No clients yet. Add your first client to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <Link key={client.id} href={`/dashboard/${client.id}`}>
                <div className="card p-5 hover:border-[var(--accent)] transition-colors cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-lg group-hover:text-[var(--accent)] transition-colors">
                        {client.name}
                      </h2>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {calcMonthsWorked(client.start_date)} months together
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--accent)' }}>
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="card-2 p-3">
                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Ad Spend</p>
                      <p className="font-semibold">${client.ad_spend.toLocaleString()}</p>
                    </div>
                    <div className="card-2 p-3">
                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Retainer</p>
                      <p className="font-semibold">${client.retainer_price.toLocaleString()}/mo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <TrendingUp size={12} style={{ color: 'var(--green)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Started {new Date(client.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setClients((prev) => [...prev, c]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

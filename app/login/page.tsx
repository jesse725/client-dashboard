'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'client' | 'team'>('client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('credentials', {
      email,
      password: mode === 'team' ? password : '',
      redirect: false,
    });

    if (res?.error) {
      setError(mode === 'client'
        ? 'No account found for that email. Make sure you use the email from your onboarding form.'
        : 'Invalid email or password.');
      setLoading(false);
    } else {
      // Fetch session to get clientId for client redirect
      const { getSession } = await import('next-auth/react');
      const session = await getSession();
      const user = session?.user as any;
      if (user?.role === 'client' && user?.clientId) {
        router.push(`/dashboard/${user.clientId}`);
      } else {
        router.push('/dashboard');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--accent)' }}>
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Merova Media</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Client Dashboard</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl p-1 mb-6" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => { setMode('client'); setError(''); }}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: mode === 'client' ? 'var(--accent)' : 'transparent',
              color: mode === 'client' ? '#fff' : 'var(--text-muted)',
            }}>
            I'm a Client
          </button>
          <button
            onClick={() => { setMode('team'); setError(''); }}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: mode === 'team' ? 'var(--surface)' : 'transparent',
              color: mode === 'team' ? 'var(--text)' : 'var(--text-muted)',
            }}>
            Team / Admin
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {mode === 'client' ? (
            <>
              <div className="text-center pb-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Welcome back 👋</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Enter the email you used when you signed up</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Your Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@yourbusiness.com"
                  required
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="team@merova.com"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-center p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in…' : mode === 'client' ? 'Access My Dashboard' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

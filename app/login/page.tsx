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
      setError(
        mode === 'client' ? 'No account found for that email. Make sure you use the email from your onboarding form.'
        : 'No account found for that email, or the password is incorrect. Employees: leave the password blank.'
      );
      setLoading(false);
    } else {
      // Let the root page do the role-based redirect — it reads the session
      // fresh server-side on every visit, so there's no client-side race
      // where the session hasn't finished hydrating yet (that race is what
      // used to intermittently send people to the wrong landing page).
      router.push('/');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Merova Media" className="h-16 mx-auto mb-3" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Client Dashboard</p>
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
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Employees: leave this blank — just sign in with your email above.
                </p>
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

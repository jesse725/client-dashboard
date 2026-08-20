'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart2, TrendingUp, Plus, Settings2, DollarSign } from 'lucide-react';

export default function AdminHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && user?.role !== 'admin') router.push('/dashboard');
  }, [status, user, router]);

  if (status !== 'authenticated' || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  const cards = [
    {
      href: '/admin/tracker',
      title: 'Client Success',
      desc: 'MRR, LTV, churn, testimonials & client health across all accounts',
      icon: <BarChart2 size={22} />,
      color: 'var(--accent)',
    },
    {
      href: '/admin/onboard',
      title: 'Onboard Client',
      desc: 'Set up a new client account, GHL connection & billing details',
      icon: <Plus size={22} />,
      color: 'var(--yellow)',
    },
    ...(user?.canViewFinancials ? [
      {
        href: '/admin/sales',
        title: 'Sales Tracker',
        desc: 'Merova AV Pipeline — funnel, weekly KPIs, kanban & table views',
        icon: <TrendingUp size={22} />,
        color: 'var(--green)',
      },
      {
        href: '/admin/income',
        title: 'Income Statement',
        desc: 'Live income statement, monthly P&L, subscriptions & payroll',
        icon: <DollarSign size={22} />,
        color: '#0d9488',
      },
    ] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <nav className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm" style={{ background: 'var(--accent)' }}>M</div>
          <span className="font-semibold">Merova Media</span>
        </div>
        <Link href="/admin" className="btn-ghost text-sm flex items-center gap-2">
          <Settings2 size={14} /> Admin Settings
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-2">Where to?</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pick a workspace to jump into</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {cards.map(c => (
              <Link key={c.href} href={c.href}>
                <div className="card p-7 h-full hover:border-[var(--accent)] transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${c.color}18`, color: c.color }}>
                    {c.icon}
                  </div>
                  <h2 className="font-semibold text-lg mb-1.5 group-hover:text-[var(--accent)] transition-colors">{c.title}</h2>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import type { IssueLevel, MetaCheck } from '@/lib/metaHealth';

// Renders one result of the Meta connection check (lib/metaHealth.ts): the facts
// that were established, then every problem with how to fix it. Shared by the
// "Test connection" buttons and the Meta Health tab.

const LEVEL: Record<IssueLevel, { color: string; Icon: typeof Info }> = {
  error: { color: 'var(--red)', Icon: XCircle },
  warn: { color: 'var(--yellow)', Icon: AlertTriangle },
  info: { color: 'var(--text-muted)', Icon: Info },
  ok: { color: 'var(--green)', Icon: CheckCircle },
};

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function tokenSummary(c: MetaCheck): { text: string; color: string } {
  const t = c.token;
  if (t.valid === false) return { text: 'Invalid or expired', color: 'var(--red)' };
  if (t.neverExpires) return { text: 'Never expires', color: 'var(--green)' };
  if (t.daysLeft != null) return { text: `Expires in ${Math.max(t.daysLeft, 0)} day${t.daysLeft === 1 ? '' : 's'}`, color: t.daysLeft <= 14 ? 'var(--yellow)' : 'var(--text)' };
  return { text: c.connected ? 'Works · expiry unknown' : '—', color: 'var(--text-muted)' };
}

// error > warning > fine — for ordering and the status pill.
export function severity(c: MetaCheck): 0 | 1 | 2 {
  if (!c.connected || c.issues.some((i) => i.level === 'error')) return 2;
  if (c.issues.some((i) => i.level === 'warn')) return 1;
  return 0;
}

export function StatusPill({ check }: { check: MetaCheck }) {
  const sev = severity(check);
  const [label, color] = sev === 2 ? [check.connected ? 'Problem' : 'Not connected', 'var(--red)'] : sev === 1 ? ['Needs attention', 'var(--yellow)'] : ['Healthy', 'var(--green)'];
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      {label}
    </span>
  );
}

export default function MetaCheckReport({ check }: { check: MetaCheck }) {
  const token = tokenSummary(check);
  const facts: { label: string; value: string; color?: string }[] = [
    { label: 'Token', value: token.text, color: token.color },
  ];
  if (check.account) {
    facts.push({ label: 'Ad account', value: `${check.account.name ?? check.account.id} · ${check.account.status}`, color: check.account.statusCode === 1 || check.account.statusCode === 201 ? undefined : 'var(--red)' });
  }
  if (check.delivery) {
    facts.push({ label: 'Ad spend', value: `${usd(check.delivery.spend7d)} last 7 days · ${usd(check.delivery.spend30d)} last 30`, color: check.delivery.spend7d === 0 ? 'var(--yellow)' : undefined });
  }
  if (check.metaLeads) {
    const g = check.leadTracking && !check.leadTracking.error ? check.leadTracking.newLeads : null;
    facts.push({ label: 'Leads, last 30 days', value: `Meta ${check.metaLeads.last30d}${g != null ? ` · GoHighLevel ${g}` : ''}` });
  }
  const attr = check.leadTracking?.attribution;
  if (attr && check.leadTracking && check.leadTracking.newLeads > 0) {
    const tied = attr.viaId + attr.viaName;
    facts.push({ label: 'Leads tied to an ad', value: `${tied} of ${check.leadTracking.newLeads}`, color: tied / check.leadTracking.newLeads < 0.5 ? 'var(--yellow)' : undefined });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-xs">
        {facts.map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="shrink-0" style={{ color: 'var(--text-muted)', minWidth: 110 }}>{f.label}</span>
            <span className="font-medium" style={{ color: f.color ?? 'var(--text)' }}>{f.value}</span>
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {check.issues.map((issue, i) => {
          const { color, Icon } = LEVEL[issue.level];
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <Icon size={14} className="shrink-0 mt-0.5" style={{ color }} />
              <div className="min-w-0">
                <p style={{ color: issue.level === 'info' || issue.level === 'ok' ? 'var(--text)' : color }}>{issue.message}</p>
                {issue.fix && <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text)' }}>How to fix:</strong> {issue.fix}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {check.leadTracking?.attributionFieldsSeen.length ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          GoHighLevel is sending these ad-tracking fields with leads: {check.leadTracking.attributionFieldsSeen.join(', ')}.
        </p>
      ) : null}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Checked {new Date(check.checkedAt).toLocaleString()}</p>
    </div>
  );
}

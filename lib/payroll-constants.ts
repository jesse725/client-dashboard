import type { PaymentMethod } from '@/types';

// Split out from lib/payroll.ts specifically so client components can import
// this without pulling in better-sqlite3 (a native module that can't bundle
// for the browser) — lib/payroll.ts re-exports it for server-side callers.
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'wise', label: 'Wise' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

export interface Client {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  ghl_api_key: string | null;
  ghl_location_id: string | null;
  ghl_pipeline_id: string | null;
  stage_leads: string | null;
  stage_contacted: string | null;
  stage_unqualified: string | null;
  stage_phone: string | null;
  stage_inhome: string | null;
  retainer_price: number | null; // null when masked from a non-Jesse admin
  ad_spend: number;
  contract_url: string | null;
  ad_account_url: string | null;
  slack_url: string | null;
  start_date: string;
  ghl_custom_fields: string | null;
  daily_ad_spend: number;
  meta_access_token: string | null;
  meta_ad_account_id: string | null;
  next_checkin: string | null;
  date_launched: string | null;
  date_billed: string | null;
  rebilling_date: string | null;
  share_token: string | null;
  cached_leads: number;
  cached_inhome: number;
  created_at: string;
}

export interface Quote {
  id: number;
  client_id: number;
  customer_name: string;
  value: number;
  status: 'open' | 'closed' | 'lost';
  drive_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: 'admin' | 'client' | 'employee';
  client_id: number | null;
  name: string;
}

export type PaymentMethod = 'bank_transfer' | 'wise' | 'paypal' | 'check' | 'other';

export interface Employee {
  id: number;
  name: string;
  role: string; // job title, e.g. "Media Buyer"
  email: string;
  active: number; // 0/1 — also gates login, same convention as clients.onboard_status
  base_amount_per_period: number;
  per_client_fee: number;
  revenue_share_pct: number;
  hourly_bonus_rate: number;
  hourly_bonus_threshold_minutes: number;
  payment_method: PaymentMethod;
  agreement_url: string | null; // link to the signed employment agreement (Drive/Dropbox/etc.)
  assigned_to: string | null; // display name of the admin/staff member who owns this employee's payroll card
  notes: string | null;
  created_at: string;
}

export interface PayPeriodBonus {
  id: number;
  pay_period_id: number;
  description: string;
  amount: number;
  added_by: string | null;
  added_at: string;
}

// One row per actual payment made — kept even if the period is later
// un-marked-paid, so the history is never lost, just no longer "current."
export interface PaymentRecord {
  id: number;
  pay_period_id: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  paid_at: string;
  recorded_by: string | null;
  created_at: string;
}

export interface PayPeriod {
  id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  payout_date: string;
  base_amount: number;
  status: 'pending' | 'paid';
  paid_at: string | null;
  created_at: string;
}

export interface PayPeriodWithTotal extends PayPeriod {
  bonusItems: PayPeriodBonus[];
  paymentRecords: PaymentRecord[];
  totalAmount: number; // base_amount + sum(bonusItems) — always computed, never stored
}

export interface GHLStageCount {
  stageId: string;
  stageName: string;
  count: number;
}

export interface PipelineStats {
  leads: number;
  contacted: number;
  unqualified: number;
  phone: number;
  inhome: number;
}

export interface DashboardMetrics {
  client: Client;
  pipeline: PipelineStats;
  quotes: Quote[];
  monthsWorked: number;
  totalRevenue: number;
  closedDeals: number;
  roi: number;
  cac: number;
  roas: number;
}

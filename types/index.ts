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
  retainer_price: number;
  ad_spend: number;
  contract_url: string | null;
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
  role: 'admin' | 'client';
  client_id: number | null;
  name: string;
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

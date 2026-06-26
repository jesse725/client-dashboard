const META_BASE = 'https://graph.facebook.com/v19.0';

export interface MetaAdStats {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;   // percentage, e.g. 2.5
  cpc: number;
  reach: number;
  frequency: number;
}

export async function fetchMetaAdStats(
  accessToken: string,
  adAccountId: string // format: act_XXXXXXXXXX
): Promise<MetaAdStats> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'spend,impressions,clicks,ctr,cpc,reach,frequency';
  const url = `${META_BASE}/${account}/insights?fields=${fields}&date_preset=maximum&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API ${res.status}: ${text}`);
  }

  const json = await res.json();
  const d = json.data?.[0];

  if (!d) {
    return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, reach: 0, frequency: 0 };
  }

  return {
    spend: parseFloat(d.spend ?? '0'),
    impressions: parseInt(d.impressions ?? '0', 10),
    clicks: parseInt(d.clicks ?? '0', 10),
    ctr: parseFloat(d.ctr ?? '0'),
    cpc: parseFloat(d.cpc ?? '0'),
    reach: parseInt(d.reach ?? '0', 10),
    frequency: parseFloat(d.frequency ?? '0'),
  };
}

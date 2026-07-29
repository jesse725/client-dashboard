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
  adAccountId: string, // format: act_XXXXXXXXXX
  datePreset: string = 'maximum',
  range?: { since: string; until: string } // overrides datePreset when provided (YYYY-MM-DD, inclusive)
): Promise<MetaAdStats> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'spend,impressions,clicks,ctr,cpc,reach,frequency';
  const dateParam = range
    ? `time_range=${encodeURIComponent(JSON.stringify(range))}`
    : `date_preset=${datePreset}`;
  const url = `${META_BASE}/${account}/insights?fields=${fields}&${dateParam}&access_token=${accessToken}`;

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

export interface MetaAdLevelStat {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
}

// Per-ad breakdown (level=ad) for a date range — used to join against GHL's
// per-lead ad attribution (utmAdId) to compute true cost-per-lead per creative.
export async function fetchMetaAdLevelStats(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<MetaAdLevelStat[]> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const fields = 'ad_id,ad_name,spend,impressions,clicks';
  const results: MetaAdLevelStat[] = [];
  let url = `${META_BASE}/${account}/insights?level=ad&fields=${fields}&time_range=${timeRange}&limit=200&access_token=${accessToken}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meta API ${res.status}: ${text}`);
    }
    const json = await res.json();
    for (const d of json.data ?? []) {
      results.push({
        adId: d.ad_id,
        adName: d.ad_name ?? d.ad_id,
        spend: parseFloat(d.spend ?? '0'),
        impressions: parseInt(d.impressions ?? '0', 10),
        clicks: parseInt(d.clicks ?? '0', 10),
      });
    }
    url = json.paging?.next ?? '';
  }

  return results;
}

// since/until in YYYY-MM-DD, inclusive
export async function fetchMetaAdSpendRange(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<number> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${META_BASE}/${account}/insights?fields=spend&time_range=${timeRange}&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API ${res.status}: ${text}`);
  }
  const json = await res.json();
  return parseFloat(json.data?.[0]?.spend ?? '0');
}

import { Client, Quote, PipelineStats } from '@/types';

export function calcDaysTogether(startDate: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000));
}

export function calcMonthsWorked(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(
    1,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  );
}

export function calcMetrics(client: Client, quotes: Quote[], pipeline: PipelineStats, metaSpend?: number) {
  const daysTogether = calcDaysTogether(client.start_date);
  const monthsWorked = calcMonthsWorked(client.start_date);

  const closedQuotes = quotes.filter((q) => q.status === 'closed');
  const openQuotes   = quotes.filter((q) => q.status === 'open');
  const totalRevenue  = closedQuotes.reduce((sum, q) => sum + q.value, 0);
  const pipelineValue = openQuotes.reduce((sum, q) => sum + q.value, 0);
  const totalQuoted   = quotes.reduce((sum, q) => sum + q.value, 0);
  const closedDeals   = closedQuotes.length;
  const avgDealValue  = closedDeals > 0 ? totalRevenue / closedDeals : 0;
  const avgQuoteValue = quotes.length > 0 ? totalQuoted / quotes.length : 0;
  const closeRateByValue = totalQuoted > 0 ? (totalRevenue / totalQuoted) * 100 : 0;
  const closeRateByCount = quotes.length > 0 ? (closedDeals / quotes.length) * 100 : 0;

  // Ad spend: prefer live Meta spend → daily_ad_spend calc → manual ad_spend
  const totalAdSpend =
    (metaSpend != null && metaSpend > 0)
      ? metaSpend
      : (client.daily_ad_spend ?? 0) > 0
        ? client.daily_ad_spend * daysTogether
        : client.ad_spend;

  const totalRetainer = client.retainer_price * monthsWorked;
  const totalCost     = totalAdSpend + totalRetainer;

  const roi  = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
  const cac  = closedDeals > 0 ? totalCost / closedDeals : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const cpl  = pipeline.leads > 0 ? totalAdSpend / pipeline.leads : 0;

  // Funnel conversion rates
  const contactRate     = pipeline.leads   > 0 ? (pipeline.contacted / pipeline.leads)   * 100 : 0;
  const leadToBookRate  = pipeline.leads   > 0 ? (pipeline.phone     / pipeline.leads)   * 100 : 0;
  const bookToHomeRate  = pipeline.phone   > 0 ? (pipeline.inhome    / pipeline.phone)   * 100 : 0;
  const homeToCloseRate = pipeline.inhome  > 0 ? (closedDeals        / pipeline.inhome)  * 100 : 0;
  const leadToCloseRate = pipeline.leads   > 0 ? (closedDeals        / pipeline.leads)   * 100 : 0;
  const closeRate       = homeToCloseRate; // alias

  return {
    daysTogether,
    monthsWorked,
    totalRevenue,
    pipelineValue,
    totalQuoted,
    closedDeals,
    avgDealValue,
    avgQuoteValue,
    closeRateByValue,
    closeRateByCount,
    totalAdSpend,
    totalRetainer,
    totalCost,
    roi,
    cac,
    roas,
    cpl,
    contactRate,
    leadToBookRate,
    bookToHomeRate,
    homeToCloseRate,
    leadToCloseRate,
    closeRate,
  };
}

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

  // Ad spend: prefer live Meta spend → exact manual override → daily_ad_spend estimate.
  // A manual entry is a deliberate "this is the real number" action, so it should
  // beat the daily-budget × days-together estimate, not the other way around.
  const totalAdSpend =
    (metaSpend != null && metaSpend > 0)
      ? metaSpend
      : (client.ad_spend ?? 0) > 0
        ? client.ad_spend
        : (client.daily_ad_spend ?? 0) * daysTogether;

  // retainer_price is null when masked from a non-Jesse admin — falls back to
  // 0 so ROI/cost math doesn't NaN out; those figures are simply approximate
  // (ad-spend-only) for admins who can't see the retainer.
  const totalRetainer = (client.retainer_price ?? 0) * monthsWorked;
  const totalCost     = totalAdSpend + totalRetainer;

  const roi  = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
  const cac  = closedDeals > 0 ? totalCost / closedDeals : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const cpl  = pipeline.leads > 0 ? totalAdSpend / pipeline.leads : 0;
  const cpih = (pipeline.inhome || 0) > 0 ? totalAdSpend / (pipeline.inhome || 0) : 0;

  // Funnel conversion rates
  const totalAppointments = (pipeline.phone || 0) + (pipeline.inhome || 0);
  const totalContacted    = (pipeline.contacted || 0) + (pipeline.phone || 0) + (pipeline.inhome || 0);
  const contactRate          = pipeline.leads    > 0 ? (totalContacted       / pipeline.leads)    * 100 : 0;
  const leadToApptRate       = pipeline.leads    > 0 ? (totalAppointments   / pipeline.leads)    * 100 : 0;
  const apptToCloseRate      = totalAppointments > 0 ? (closedDeals         / totalAppointments) * 100 : 0;
  const leadToCloseRate      = pipeline.leads    > 0 ? (closedDeals         / pipeline.leads)    * 100 : 0;
  // keep old names for backwards compat
  const leadToBookRate  = leadToApptRate;
  const bookToHomeRate  = pipeline.phone > 0 ? ((pipeline.inhome || 0) / pipeline.phone) * 100 : 0;
  const homeToCloseRate = apptToCloseRate;
  const closeRate       = apptToCloseRate;

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
    cpih,
    totalAppointments,
    totalContacted,
    contactRate,
    leadToApptRate,
    apptToCloseRate,
    leadToBookRate,
    bookToHomeRate,
    homeToCloseRate,
    leadToCloseRate,
    closeRate,
  };
}

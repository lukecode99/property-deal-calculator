import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { calcDeal } from '../engine/dealEngine';
import { DealInputs, Strategy } from '../types';

export interface DealReportData {
  label: string;
  strategy: Strategy;
  inputs: DealInputs;
  stampDuty: number;
  monthlyMortgage: number;
  totalInvested: number;
  capitalLeftIn?: number;
  cashOnCash: number;
  monthlyNetCashflow: number;
  grossYield: number;
  netYield: number;
  fiveYearTotalReturn?: number;
  floodRiskLevel?: 'low' | 'medium' | 'high';
  floodRiskZoneLabel?: string;
  floodRiskAnnualProb?: string;
}

const STRAT_COLOR: Record<Strategy, string> = {
  btl: '#3B82F6',
  hmo: '#F59E0B',
  stl: '#10B981',
};

const STRAT_LABEL: Record<Strategy, string> = {
  btl: 'Buy-to-Let',
  hmo: 'HMO',
  stl: 'STL / AirBnB',
};

function gbp(n: number, dp = 0): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pct(n: number, dp = 1): string {
  return n.toFixed(dp) + '%';
}

function bar(value: number, max: number, color: string, height = 20): string {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div style="background:#f0f0f0;border-radius:4px;height:${height}px;overflow:hidden;"><div style="background:${color};width:${w}%;height:100%;border-radius:4px;"></div></div>`;
}

function cashflowChartSVG(grossIncome: number, mortgage: number, opex: number, net: number): string {
  const max = grossIncome || 1;
  const W = 420;
  const barH = 28;
  const gap = 14;
  const labelW = 110;
  const chartW = W - labelW - 60;
  const H = (barH + gap) * 4 + 10;

  const rows: { label: string; value: number; color: string; sign?: string }[] = [
    { label: 'Gross Income', value: grossIncome, color: '#22c55e' },
    { label: 'Mortgage', value: mortgage, color: '#ef4444', sign: '−' },
    { label: 'OPEX', value: opex, color: '#f97316', sign: '−' },
    { label: 'Net Cashflow', value: net, color: net >= 0 ? '#3B82F6' : '#dc2626' },
  ];

  const svgRows = rows.map((r, i) => {
    const w = Math.max(0, Math.min(chartW, (Math.abs(r.value) / max) * chartW));
    const y = i * (barH + gap);
    const sign = r.sign ?? '';
    const valText = sign + gbp(Math.abs(r.value));
    return `
      <text x="${labelW - 6}" y="${y + barH / 2 + 5}" text-anchor="end" font-size="11" fill="#555">${r.label}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${r.color}" opacity="0.9"/>
      <text x="${labelW + w + 6}" y="${y + barH / 2 + 5}" font-size="11" fill="#333">${valText}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svgRows}</svg>`;
}

function yieldChartSVG(grossYield: number, netYield: number, cashOnCash: number): string {
  const max = Math.max(grossYield, netYield, cashOnCash, 0.1) * 1.25;
  const W = 420;
  const H = 130;
  const chartH = 80;
  const barW = 70;
  const gap = 30;
  const baseY = H - 30;
  const startX = 40;

  const bars: { label: string; value: number; color: string }[] = [
    { label: 'Gross Yield', value: grossYield, color: '#22c55e' },
    { label: 'Net Yield', value: netYield, color: '#3B82F6' },
    { label: 'Cash-on-Cash', value: cashOnCash, color: '#a855f7' },
  ];

  const svgBars = bars.map((b, i) => {
    const x = startX + i * (barW + gap);
    const h = Math.max(2, (b.value / max) * chartH);
    const y = baseY - h;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${b.color}" opacity="0.85"/>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${b.color}">${pct(b.value)}</text>
      <text x="${x + barW / 2}" y="${baseY + 14}" text-anchor="middle" font-size="10" fill="#666">${b.label}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${startX - 10}" y1="${baseY}" x2="${W - 10}" y2="${baseY}" stroke="#ddd" stroke-width="1"/>
    ${svgBars}
  </svg>`;
}

function capitalChartSVG(deposit: number, stampDuty: number, fees: number, refurb: number): string {
  const total = deposit + stampDuty + fees + refurb || 1;
  const W = 420;
  const barH = 28;
  const H = 80;
  const barY = 14;

  const slices: { label: string; value: number; color: string }[] = [
    { label: 'Deposit', value: deposit, color: '#3B82F6' },
    { label: 'SDLT', value: stampDuty, color: '#ef4444' },
    { label: 'Fees', value: fees, color: '#f97316' },
    { label: 'Refurb', value: refurb, color: '#a855f7' },
  ];

  let cursor = 0;
  const rects = slices.map(s => {
    const w = (s.value / total) * W;
    const rect = `<rect x="${cursor}" y="${barY}" width="${w}" height="${barH}" fill="${s.color}" opacity="0.85"/>`;
    cursor += w;
    return rect;
  }).join('');

  const legends = slices.map((s, i) => {
    const x = 10 + i * 100;
    return `<rect x="${x}" y="${barH + barY + 8}" width="10" height="10" fill="${s.color}" rx="2"/><text x="${x + 14}" y="${barH + barY + 18}" font-size="10" fill="#555">${s.label} ${pct((s.value / total) * 100, 0)}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${barY}" width="${W}" height="${barH}" rx="6" fill="#f0f0f0"/>
    ${rects}
    ${legends}
  </svg>`;
}

function buildHtml(deal: DealReportData, results: NonNullable<ReturnType<typeof calcDeal>>): string {
  const color = STRAT_COLOR[deal.strategy];
  const stratLabel = STRAT_LABEL[deal.strategy];
  const isBRR = deal.strategy === 'btl' && deal.inputs.refinanceAfterRefurb === 'yes';
  const price = parseFloat(deal.inputs.purchasePrice) || 0;
  const solicitor = parseFloat(deal.inputs.solicitorFees) || 0;
  const mortFee = parseFloat(deal.inputs.mortgageFee) || 0;
  const fees = solicitor + mortFee + (parseFloat(deal.inputs.other) || 0);
  const refurb = results.totalInvested - results.totalPurchaseCosts - (results.initialFinancingCost ?? 0);
  const deposit = price - results.mortgageAmount;

  const floodEmoji = deal.floodRiskLevel === 'low' ? '🟢' : deal.floodRiskLevel === 'medium' ? '🟡' : deal.floodRiskLevel === 'high' ? '🔴' : '—';
  const floodLabel = deal.floodRiskLevel
    ? `${floodEmoji} ${deal.floodRiskZoneLabel || deal.floodRiskLevel.charAt(0).toUpperCase() + deal.floodRiskLevel.slice(1)}`
    : '—';

  const cashflowSVG = cashflowChartSVG(
    results.monthlyGrossIncome,
    results.monthlyMortgage,
    results.monthlyOpex,
    results.monthlyNetCashflow,
  );
  const yieldSVG = yieldChartSVG(results.grossYield, results.netYield, results.cashOnCash);
  const capitalSVG = capitalChartSVG(deposit, results.stampDuty, fees, Math.max(0, refurb));

  const proj = results.projection5yr;
  const stress = results.stress;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Deal Report: ${deal.label}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1a1a2e; padding: 24px; background: #fff; }
  h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
  .badge { display: inline-block; background: ${color}; color: #fff; border-radius: 6px; padding: 3px 12px; font-size: 12px; font-weight: 700; margin-bottom: 18px; letter-spacing: 0.3px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .card-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
  .card-value { font-size: 19px; font-weight: 700; color: ${color}; line-height: 1.1; }
  .card-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .neg { color: #ef4444; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
  td:last-child { text-align: right; font-weight: 600; }
  tr.total td { font-weight: 700; font-size: 13px; border-top: 2px solid #e2e8f0; border-bottom: none; color: #0f172a; }
  tr.sub td { color: #64748b; font-size: 11px; }
  .chart-wrap { margin-bottom: 6px; }
  .chart-title { font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; }
  .dd-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  .dd-row span:last-child { font-weight: 600; color: #0f172a; }
  footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; padding-top: 12px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>

<h1>${deal.label}</h1>
<span class="badge">${stratLabel}${isBRR ? ' · BRR' : ''}</span>

<div class="grid">
  <div class="card">
    <div class="card-label">Monthly Cashflow</div>
    <div class="card-value${results.monthlyNetCashflow < 0 ? ' neg' : ''}">${gbp(results.monthlyNetCashflow)}</div>
    <div class="card-sub">net / month</div>
  </div>
  <div class="card">
    <div class="card-label">Cash-on-Cash</div>
    <div class="card-value">${pct(results.cashOnCash)}</div>
    <div class="card-sub">annual return on cash</div>
  </div>
  <div class="card">
    <div class="card-label">Total Invested</div>
    <div class="card-value">${gbp(results.totalInvested)}</div>
    <div class="card-sub">${isBRR && deal.capitalLeftIn != null ? 'capital left in: ' + gbp(deal.capitalLeftIn) : 'inc. all costs'}</div>
  </div>
  <div class="card">
    <div class="card-label">Gross Yield</div>
    <div class="card-value">${pct(results.grossYield)}</div>
    <div class="card-sub">on purchase price</div>
  </div>
  <div class="card">
    <div class="card-label">Net Yield</div>
    <div class="card-value">${pct(results.netYield)}</div>
    <div class="card-sub">after all costs</div>
  </div>
  <div class="card">
    <div class="card-label">${deal.strategy === 'btl' && isBRR ? 'Capital Left In' : 'Stamp Duty'}</div>
    <div class="card-value">${isBRR && deal.capitalLeftIn != null ? gbp(deal.capitalLeftIn) : gbp(results.stampDuty)}</div>
    <div class="card-sub">${isBRR ? 'after refinance' : 'SDLT (additional)'}</div>
  </div>
</div>

<h2>Balance Sheet</h2>
<table>
  <tr><td>Purchase Price</td><td>${gbp(price)}</td></tr>
  <tr><td style="padding-left:16px;color:#64748b">Deposit (${deal.inputs.depositPct}%)</td><td>${gbp(deposit)}</td></tr>
  <tr><td style="padding-left:16px;color:#64748b">Mortgage (${pct(100 - parseFloat(deal.inputs.depositPct || '25'), 0)} LTV)</td><td>${gbp(results.mortgageAmount)}</td></tr>
  <tr><td>Stamp Duty (SDLT)</td><td>${gbp(results.stampDuty)}</td></tr>
  <tr><td>Solicitor Fees</td><td>${gbp(solicitor)}</td></tr>
  <tr><td>Mortgage Fee</td><td>${gbp(mortFee)}</td></tr>
  ${fees - solicitor - mortFee > 0 ? `<tr><td>Other Purchase Costs</td><td>${gbp(fees - solicitor - mortFee)}</td></tr>` : ''}
  ${refurb > 0 ? `<tr><td>Refurb / Renovation</td><td>${gbp(refurb)}</td></tr>` : ''}
  ${results.initialFinancingCost ? `<tr><td>Bridging / Initial Finance</td><td>${gbp(results.initialFinancingCost)}</td></tr>` : ''}
  <tr class="total"><td>Total Invested</td><td>${gbp(results.totalInvested)}</td></tr>
  ${isBRR && deal.capitalLeftIn != null ? `<tr class="sub"><td style="padding-left:16px">After Refinance</td><td>${gbp(deal.capitalLeftIn)} left in</td></tr>` : ''}
</table>

<h2>Monthly P&amp;L</h2>
<table>
  <tr><td>Gross Rental Income</td><td>${gbp(results.monthlyGrossIncome)}</td></tr>
  <tr><td>Mortgage Payment (interest only)</td><td style="color:#ef4444">(${gbp(results.monthlyMortgage)})</td></tr>
  <tr><td>Operating Expenses</td><td style="color:#f97316">(${gbp(results.monthlyOpex)})</td></tr>
  <tr class="total"><td>Net Monthly Cashflow</td><td class="${results.monthlyNetCashflow < 0 ? 'neg' : ''}">${gbp(results.monthlyNetCashflow)}</td></tr>
  <tr class="sub"><td>Annual Net Cashflow</td><td>${gbp(results.annualNetCashflow)}</td></tr>
</table>

<h2>Cashflow Breakdown</h2>
<div class="chart-wrap">${cashflowSVG}</div>

<h2>Yield Comparison</h2>
<div class="chart-wrap">${yieldSVG}</div>

<h2>Capital Allocation</h2>
<div class="chart-wrap">${capitalChartSVG(deposit, results.stampDuty, fees, Math.max(0, refurb))}</div>

<h2>5-Year Projection</h2>
<table>
  <tr><td>Estimated Property Value</td><td>${gbp(proj.estimatedValue)}</td></tr>
  <tr><td>Projected Capital Growth</td><td>${gbp(proj.capitalGrowth)}</td></tr>
  <tr><td>Cumulative Net Cashflow</td><td>${gbp(proj.cumulativeCashflow)}</td></tr>
  <tr class="total"><td>Total 5-Year Return</td><td>${gbp(proj.totalReturn)}</td></tr>
</table>

<h2>Stress Tests (Monthly Cashflow)</h2>
<table>
  <tr><td>Rent 10% lower</td><td class="${stress.rent10pctDrop < 0 ? 'neg' : ''}">${gbp(stress.rent10pctDrop)}</td></tr>
  <tr><td>Rates at ${deal.inputs.mortgageFutureRate || '+2%'}</td><td class="${stress.ratesAtFutureRate < 0 ? 'neg' : ''}">${gbp(stress.ratesAtFutureRate)}</td></tr>
  <tr><td>4-week void</td><td class="${stress.void4weeks < 0 ? 'neg' : ''}">${gbp(stress.void4weeks)}</td></tr>
</table>

<h2>Due Diligence</h2>
<div class="dd-row"><span>Postcode</span><span>${deal.inputs.postcode || '—'}</span></div>
${deal.inputs.houseNumber ? `<div class="dd-row"><span>Address</span><span>${deal.inputs.houseNumber} ${deal.inputs.postcode}</span></div>` : ''}
${deal.inputs.bedrooms ? `<div class="dd-row"><span>Bedrooms</span><span>${deal.inputs.bedrooms}</span></div>` : ''}
${deal.inputs.epcRating ? `<div class="dd-row"><span>EPC Rating</span><span>${deal.inputs.epcRating}</span></div>` : ''}
<div class="dd-row"><span>Flood Risk</span><span>${floodLabel}${deal.floodRiskAnnualProb ? ' · ' + deal.floodRiskAnnualProb + '/yr' : ''}</span></div>
${deal.inputs.url ? `<div class="dd-row"><span>Listing URL</span><span>${deal.inputs.url}</span></div>` : ''}

<footer>Property Deal Calculator · Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · For illustration purposes only. Not financial advice.</footer>
</body>
</html>`;
}

export async function generateAndShareDealPDF(deal: DealReportData): Promise<void> {
  const results = calcDeal(deal.inputs);
  if (!results) throw new Error('Could not calculate deal results');

  const html = buildHtml(deal, results);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share: ${deal.label}`,
    UTI: 'com.adobe.pdf',
  });
}

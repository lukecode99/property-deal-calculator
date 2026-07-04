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

interface SoldSale {
  address?: string;
  paon?: string;
  saon?: string;
  street?: string;
  price?: number;
  date?: string;
  propertyType?: string;
}

const STRAT_COLOR: Record<Strategy, string> = {
  btl: '#2563EB',
  hmo: '#D97706',
  stl: '#059669',
};

const STRAT_LABEL: Record<Strategy, string> = {
  btl: 'Buy-to-Let',
  hmo: 'HMO',
  stl: 'STL / AirBnB',
};

function gbp(n: number, dp = 0): string {
  return '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pct(n: number, dp = 1): string {
  return n.toFixed(dp) + '%';
}

async function fetchSoldPrices(postcode: string): Promise<SoldSale[]> {
  if (!postcode) return [];
  try {
    const pc = postcode.trim().toUpperCase().replace(/\s+/g, ' ');
    const res = await fetch(`https://sold-prices.nanoluke521.workers.dev/?postcode=${encodeURIComponent(pc)}`);
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    return Array.isArray(data) ? (data as SoldSale[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function cashflowChartSVG(grossIncome: number, mortgage: number, opex: number, net: number): string {
  const W = 380;
  const ROW_H = 32;
  const GAP = 10;
  const LABEL_W = 122;
  const CHART_W = W - LABEL_W - 80;
  const max = Math.max(grossIncome, 1);
  const H = (ROW_H + GAP) * 4 - GAP + 4;

  const rows: { label: string; value: number; color: string; prefix: string }[] = [
    { label: 'Gross Income', value: grossIncome, color: '#22c55e', prefix: '' },
    { label: 'Mortgage', value: mortgage, color: '#ef4444', prefix: '−' },
    { label: 'Operating Costs', value: opex, color: '#f59e0b', prefix: '−' },
    { label: 'Net Cashflow', value: net, color: net >= 0 ? '#2563EB' : '#dc2626', prefix: net < 0 ? '−' : '' },
  ];

  const rowsSvg = rows.map((r, i) => {
    const y = i * (ROW_H + GAP);
    const barW = Math.max(0, Math.min(CHART_W, (Math.abs(r.value) / max) * CHART_W));
    return `
      <text x="${LABEL_W - 8}" y="${y + ROW_H / 2 + 4}" text-anchor="end" font-size="11" fill="#64748b">${r.label}</text>
      <rect x="${LABEL_W}" y="${y + 2}" width="${CHART_W}" height="${ROW_H - 4}" rx="3" fill="#f1f5f9"/>
      <rect x="${LABEL_W}" y="${y + 2}" width="${barW}" height="${ROW_H - 4}" rx="3" fill="${r.color}" opacity="0.9"/>
      <text x="${LABEL_W + barW + 6}" y="${y + ROW_H / 2 + 4}" font-size="11" font-weight="600" fill="${r.color}">${r.prefix}${gbp(Math.abs(r.value))}/mo</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${rowsSvg}</svg>`;
}

function yieldChartSVG(grossYield: number, netYield: number, cashOnCash: number): string {
  const W = 380;
  const H = 145;
  const CHART_H = 90;
  const BASE_Y = 108;
  const BAR_W = 72;
  const GAP = 28;
  const START_X = 30;
  const max = Math.max(grossYield, netYield, cashOnCash, 0.1) * 1.35;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const y = BASE_Y - t * CHART_H;
    const val = (t * max).toFixed(1);
    return `<line x1="${START_X - 5}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
      <text x="${START_X - 8}" y="${y + 4}" text-anchor="end" font-size="9" fill="#94a3b8">${val}%</text>`;
  }).join('');

  const bars = [
    { label: 'Gross Yield', value: grossYield, color: '#22c55e' },
    { label: 'Net Yield', value: netYield, color: '#2563EB' },
    { label: 'Cash-on-Cash', value: cashOnCash, color: '#7c3aed' },
  ];

  const svgBars = bars.map((b, i) => {
    const x = START_X + i * (BAR_W + GAP);
    const h = Math.max(3, (b.value / max) * CHART_H);
    const y = BASE_Y - h;
    return `
      <rect x="${x}" y="${y}" width="${BAR_W}" height="${h}" rx="5" fill="${b.color}" opacity="0.85"/>
      <text x="${x + BAR_W / 2}" y="${y - 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${b.color}">${pct(b.value)}</text>
      <text x="${x + BAR_W / 2}" y="${BASE_Y + 14}" text-anchor="middle" font-size="10" fill="#64748b">${b.label}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    <line x1="${START_X - 5}" y1="${BASE_Y}" x2="${W - 10}" y2="${BASE_Y}" stroke="#94a3b8" stroke-width="1.5"/>
    ${svgBars}
  </svg>`;
}

function projectionChartSVG(annualCashflow: number, capitalGrowth5yr: number): string {
  const W = 380;
  const H = 150;
  const CHART_H = 95;
  const BASE_Y = 116;
  const BAR_W = 44;
  const GAP = 18;
  const START_X = 22;

  const data = [1, 2, 3, 4, 5].map(yr => ({
    yr,
    cashflow: annualCashflow * yr,
    capital: (capitalGrowth5yr / 5) * yr,
  }));

  const maxVal = Math.max(...data.map(d => Math.abs(d.cashflow) + Math.abs(d.capital)), 1);

  const gridLines = [0, 0.5, 1].map(t => {
    const y = BASE_Y - t * CHART_H;
    return `<line x1="${START_X}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
      <text x="${W - 8}" y="${y + 4}" text-anchor="end" font-size="9" fill="#94a3b8">${gbp(t * maxVal)}</text>`;
  }).join('');

  const barsSvg = data.map((d, i) => {
    const x = START_X + i * (BAR_W + GAP);
    const cashH = Math.max(0, (Math.abs(d.cashflow) / maxVal) * CHART_H);
    const capH = Math.max(0, (Math.abs(d.capital) / maxVal) * CHART_H);
    const cashY = BASE_Y - cashH;
    const capY = cashY - capH;
    const totalH = cashH + capH;
    const total = d.cashflow + d.capital;
    return `
      <rect x="${x}" y="${capY}" width="${BAR_W}" height="${capH}" fill="#7c3aed" opacity="0.78"/>
      <rect x="${x}" y="${cashY}" width="${BAR_W}" height="${cashH}" fill="#2563EB" opacity="0.85"/>
      <text x="${x + BAR_W / 2}" y="${BASE_Y - totalH - 4}" text-anchor="middle" font-size="9" font-weight="600" fill="#334155">${gbp(total)}</text>
      <text x="${x + BAR_W / 2}" y="${BASE_Y + 12}" text-anchor="middle" font-size="10" fill="#64748b">Yr ${d.yr}</text>`;
  }).join('');

  const legend = `
    <rect x="${START_X}" y="${H - 14}" width="10" height="10" rx="2" fill="#2563EB" opacity="0.85"/>
    <text x="${START_X + 14}" y="${H - 5}" font-size="10" fill="#64748b">Cumulative Cashflow</text>
    <rect x="${START_X + 148}" y="${H - 14}" width="10" height="10" rx="2" fill="#7c3aed" opacity="0.78"/>
    <text x="${START_X + 162}" y="${H - 5}" font-size="10" fill="#64748b">Capital Growth</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    <line x1="${START_X}" y1="${BASE_Y}" x2="${W - 10}" y2="${BASE_Y}" stroke="#94a3b8" stroke-width="1.5"/>
    ${barsSvg}
    ${legend}
  </svg>`;
}

function capitalChartSVG(deposit: number, stampDuty: number, fees: number, refurb: number): string {
  const slices = [
    { label: 'Deposit', value: deposit, color: '#2563EB' },
    { label: 'SDLT', value: stampDuty, color: '#ef4444' },
    { label: 'Fees', value: fees, color: '#f59e0b' },
    { label: 'Refurb', value: refurb, color: '#7c3aed' },
  ].filter(s => s.value > 0);

  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const W = 380;
  const BAR_H = 30;
  const H = 80;
  const BAR_Y = 8;

  let cursor = 0;
  const rects = slices.map(s => {
    const w = (s.value / total) * W;
    const r = `<rect x="${cursor.toFixed(1)}" y="${BAR_Y}" width="${w.toFixed(1)}" height="${BAR_H}" fill="${s.color}" opacity="0.88"/>`;
    cursor += w;
    return r;
  }).join('');

  const legends = slices.map((s, i) => {
    const x = 8 + i * 90;
    return `<rect x="${x}" y="${BAR_Y + BAR_H + 10}" width="10" height="10" rx="2" fill="${s.color}" opacity="0.88"/>
      <text x="${x + 14}" y="${BAR_Y + BAR_H + 19}" font-size="10" fill="#64748b">${s.label} ${pct((s.value / total) * 100, 0)}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${BAR_Y}" width="${W}" height="${BAR_H}" rx="6" fill="#f1f5f9"/>
    ${rects}
    ${legends}
  </svg>`;
}

function stressRow(label: string, value: number): string {
  const isGood = value >= 0;
  const isWarn = value < 0 && value >= -100;
  const dotColor = isGood ? '#22c55e' : isWarn ? '#f59e0b' : '#ef4444';
  const valColor = isGood ? '#166534' : '#991b1b';
  const bg = isGood ? '#f0fdf4' : isWarn ? '#fffbeb' : '#fef2f2';
  const valStr = (value < 0 ? '−' : '+') + gbp(Math.abs(value)) + '/mo';
  return `<tr style="background:${bg}">
    <td style="padding:6px 10px;font-size:12px;color:#374151">${label}</td>
    <td style="padding:6px 10px;text-align:right">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle"></span>
      <span style="font-size:12px;font-weight:700;color:${valColor}">${valStr}</span>
    </td>
  </tr>`;
}

function soldPricesHtml(sales: SoldSale[]): string {
  if (!sales.length) {
    return '<p style="color:#94a3b8;font-size:12px;padding:8px 0">No recent sold prices found for this postcode.</p>';
  }

  const rows = sales.map(s => {
    const addr = s.address || [s.saon, s.paon, s.street].filter(Boolean).join(' ') || '—';
    const price = s.price ? gbp(s.price) : '—';
    const date = s.date
      ? new Date(s.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      : '—';
    const type = s.propertyType || '';
    return `<tr>
      <td style="padding:5px 8px;font-size:11px;color:#374151">${addr}</td>
      <td style="padding:5px 8px;font-size:11px;color:#64748b;text-align:center">${type}</td>
      <td style="padding:5px 8px;font-size:11px;font-weight:600;color:#0f172a;text-align:right">${price}</td>
      <td style="padding:5px 8px;font-size:11px;color:#64748b;text-align:right">${date}</td>
    </tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#f8fafc">
        <th style="padding:5px 8px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;font-weight:600">Address</th>
        <th style="padding:5px 8px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:center;font-weight:600">Type</th>
        <th style="padding:5px 8px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;font-weight:600">Price</th>
        <th style="padding:5px 8px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;font-weight:600">Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildHtml(
  deal: DealReportData,
  results: NonNullable<ReturnType<typeof calcDeal>>,
  soldPrices: SoldSale[],
): string {
  const color = STRAT_COLOR[deal.strategy];
  const stratLabel = STRAT_LABEL[deal.strategy];
  const isBRR = deal.strategy === 'btl' && deal.inputs.refinanceAfterRefurb === 'yes';
  const price = parseFloat(deal.inputs.purchasePrice) || 0;
  const solicitor = parseFloat(deal.inputs.solicitorFees) || 0;
  const mortFee = parseFloat(deal.inputs.mortgageFee) || 0;
  const otherFees = parseFloat(deal.inputs.other) || 0;
  const totalFees = solicitor + mortFee + otherFees;
  const deposit = results.deposit;
  const ongoingMortgage = results.monthlyPostRefiMortgage ?? results.monthlyMortgage;
  const refurb = Math.max(0, results.totalInvested - results.totalPurchaseCosts - (results.initialFinancingCost ?? 0));

  const floodColors: Record<string, string> = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
  const floodBgMap: Record<string, string> = { low: '#f0fdf4', medium: '#fffbeb', high: '#fef2f2' };
  const floodFC = deal.floodRiskLevel ? floodColors[deal.floodRiskLevel] : '#94a3b8';
  const floodBgC = deal.floodRiskLevel ? floodBgMap[deal.floodRiskLevel] : '#f8fafc';
  const floodText = deal.floodRiskLevel
    ? `${deal.floodRiskZoneLabel || deal.floodRiskLevel.charAt(0).toUpperCase() + deal.floodRiskLevel.slice(1)} risk`
    : 'Not assessed';

  const cashflowSVG = cashflowChartSVG(
    results.monthlyGrossIncome, ongoingMortgage, results.monthlyOpex, results.monthlyNetCashflow,
  );
  const yieldSVG = yieldChartSVG(results.grossYield, results.netYield, results.cashOnCash);
  const capitalSVG = capitalChartSVG(deposit, results.stampDuty, totalFees, refurb);
  const projSVG = projectionChartSVG(results.annualNetCashflow, results.projection5yr.capitalGrowth);

  const sdltRows = results.sdltBreakdown
    .filter(b => b.tax > 0)
    .map(b => `<tr class="sub"><td style="padding-left:20px">${b.band}</td><td>${gbp(b.tax)}</td></tr>`)
    .join('');

  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const futureRateLabel = deal.inputs.mortgageFutureRate ? `at ${deal.inputs.mortgageFutureRate}%` : 'stress rate';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Deal Report: ${deal.label}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 20px 24px 32px; }

  .header { border-left: 5px solid ${color}; padding-left: 14px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.2; }
  .header-meta { margin-top: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .badge { display: inline-block; background: ${color}; color: #fff; border-radius: 6px; padding: 3px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; }
  .badge-outline { display: inline-block; border: 1.5px solid ${color}44; color: ${color}; border-radius: 6px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
  .meta-pill { font-size: 11px; color: #64748b; background: #f1f5f9; border-radius: 4px; padding: 2px 8px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 20px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
  .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.9px; color: #94a3b8; margin-bottom: 4px; }
  .kpi-value { font-size: 18px; font-weight: 800; color: ${color}; line-height: 1; }
  .kpi-value.neg { color: #dc2626; }
  .kpi-sub { font-size: 9px; color: #94a3b8; margin-top: 3px; }

  h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin: 20px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }

  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 10px; font-size: 12px; border-bottom: 1px solid #f1f5f9; color: #374151; }
  td:last-child { text-align: right; font-weight: 600; color: #0f172a; }
  tr.sub td { font-size: 11px; color: #94a3b8; border-bottom: 1px solid #f8fafc; }
  tr.sub td:last-child { color: #94a3b8; font-weight: 500; }
  tr.total td { font-weight: 700; font-size: 13px; border-top: 2px solid #e2e8f0; border-bottom: none; color: #0f172a; background: #f8fafc; padding: 7px 10px; }

  .chart-section { margin-bottom: 4px; }

  .flood-pill { display: inline-flex; align-items: center; gap: 6px; background: ${floodBgC}; border: 1px solid ${floodFC}40; border-radius: 20px; padding: 4px 12px; }
  .flood-dot { width: 8px; height: 8px; border-radius: 50%; background: ${floodFC}; flex-shrink: 0; }
  .flood-text { font-size: 12px; font-weight: 600; color: ${floodFC}; }

  footer { margin-top: 28px; font-size: 10px; color: #94a3b8; text-align: center; padding-top: 12px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>

<div class="header">
  <h1>${deal.label}</h1>
  <div class="header-meta">
    <span class="badge">${stratLabel}${isBRR ? ' · BRR' : ''}</span>
    ${deal.inputs.postcode ? `<span class="badge-outline">${deal.inputs.postcode.toUpperCase()}</span>` : ''}
    ${deal.inputs.bedrooms ? `<span class="meta-pill">${deal.inputs.bedrooms} bed</span>` : ''}
    ${deal.inputs.epcRating ? `<span class="meta-pill">EPC ${deal.inputs.epcRating}</span>` : ''}
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-label">Monthly Cashflow</div>
    <div class="kpi-value${results.monthlyNetCashflow < 0 ? ' neg' : ''}">${results.monthlyNetCashflow < 0 ? '−' : ''}${gbp(Math.abs(results.monthlyNetCashflow))}</div>
    <div class="kpi-sub">net / month</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Cash-on-Cash</div>
    <div class="kpi-value">${results.allCapitalOut ? '∞' : pct(results.cashOnCash)}</div>
    <div class="kpi-sub">${results.allCapitalOut ? 'all capital out at refi' : 'annual return on cash'}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Total Invested</div>
    <div class="kpi-value">${gbp(results.totalInvested)}</div>
    <div class="kpi-sub">${isBRR && results.capitalLeftIn != null ? 'left in after refi: ' + (results.allCapitalOut ? '£0 (all out)' : gbp(results.capitalLeftIn)) : 'all-in cost'}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Gross Yield</div>
    <div class="kpi-value">${pct(results.grossYield)}</div>
    <div class="kpi-sub">on purchase price</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Net Yield</div>
    <div class="kpi-value">${pct(results.netYield)}</div>
    <div class="kpi-sub">after all costs</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">5-Year Return</div>
    <div class="kpi-value">${gbp(results.projection5yr.totalReturn)}</div>
    <div class="kpi-sub">cashflow + capital growth</div>
  </div>
</div>

<h2>Acquisition Balance Sheet</h2>
<table>
  <tr><td>Purchase Price</td><td>${gbp(price)}</td></tr>
  ${results.mortgageAmount > 0
    ? `<tr class="sub"><td style="padding-left:20px">Deposit (${deal.inputs.depositPct || '25'}%)</td><td>${gbp(deposit)}</td></tr>
  <tr class="sub"><td style="padding-left:20px">Mortgage — ${pct(100 - parseFloat(deal.inputs.depositPct || '25'), 0)} LTV @ ${deal.inputs.interestRate || '5.5'}% p.a.</td><td>${gbp(results.mortgageAmount)}</td></tr>`
    : `<tr class="sub"><td style="padding-left:20px">Cash to Complete (bridge purchase)</td><td>${gbp(deposit)}</td></tr>`}
  <tr><td>Stamp Duty (SDLT)</td><td>${gbp(results.stampDuty)}</td></tr>
  ${sdltRows}
  <tr><td>Solicitor / Legal Fees</td><td>${gbp(solicitor)}</td></tr>
  <tr><td>Mortgage Arrangement Fee</td><td>${gbp(mortFee)}</td></tr>
  ${otherFees > 0 ? `<tr><td>Other Purchase Costs</td><td>${gbp(otherFees)}</td></tr>` : ''}
  ${refurb > 0 ? `<tr><td>Refurbishment</td><td>${gbp(refurb)}</td></tr>` : ''}
  ${results.initialFinancingCost ? `<tr><td>Bridging Finance Cost</td><td>${gbp(results.initialFinancingCost)}</td></tr>` : ''}
  <tr class="total"><td>Total Capital Required</td><td>${gbp(results.totalInvested)}</td></tr>
  ${isBRR && results.capitalLeftIn != null ? `<tr class="sub"><td style="padding-left:20px">Capital Left In (post-refinance)</td><td>${gbp(results.capitalLeftIn)}</td></tr>` : ''}
</table>

<h2>Monthly Profit &amp; Loss</h2>
<table>
  <tr><td>Gross Rental Income</td><td>${gbp(results.monthlyGrossIncome)}</td></tr>
  <tr class="sub"><td style="padding-left:20px">Mortgage (interest only${isBRR ? ', post-refi' : ''})</td><td style="color:#ef4444">(${gbp(ongoingMortgage)})</td></tr>
  <tr class="sub"><td style="padding-left:20px">Operating Expenses</td><td style="color:#f59e0b">(${gbp(results.monthlyOpex)})</td></tr>
  <tr class="total"><td>Net Monthly Cashflow</td><td style="color:${results.monthlyNetCashflow < 0 ? '#dc2626' : '#166534'}">${results.monthlyNetCashflow < 0 ? '−' : ''}${gbp(Math.abs(results.monthlyNetCashflow))}</td></tr>
  <tr class="sub"><td style="padding-left:20px">Annual Net Cashflow</td><td>${gbp(results.annualNetCashflow)}</td></tr>
</table>

<h2>Cashflow Breakdown</h2>
<div class="chart-section">${cashflowSVG}</div>

<h2>Yield Comparison</h2>
<div class="chart-section">${yieldSVG}</div>

<h2>Capital Allocation</h2>
<div class="chart-section">${capitalSVG}</div>

<h2>5-Year Cumulative Return</h2>
<div class="chart-section">${projSVG}</div>
<table style="margin-top:8px">
  <tr><td>Estimated Property Value (${deal.inputs.capitalGrowthPct || '3'}% pa)</td><td>${gbp(results.projection5yr.estimatedValue)}</td></tr>
  <tr><td>Capital Growth Over 5 Years</td><td>${gbp(results.projection5yr.capitalGrowth)}</td></tr>
  <tr><td>Cumulative Net Cashflow</td><td>${gbp(results.projection5yr.cumulativeCashflow)}</td></tr>
  <tr class="total"><td>Total 5-Year Return</td><td>${gbp(results.projection5yr.totalReturn)}</td></tr>
</table>

<h2>Stress Tests</h2>
<table>
  <tbody>
    ${stressRow('Rent 10% lower', results.stress.rent10pctDrop)}
    ${stressRow('Mortgage rate ' + futureRateLabel, results.stress.ratesAtFutureRate)}
    ${stressRow('4-week void period', results.stress.void4weeks)}
  </tbody>
</table>

<h2>Due Diligence</h2>
<table>
  ${deal.inputs.postcode ? `<tr><td style="padding:5px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9">Postcode</td><td style="padding:5px 10px;font-size:12px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9">${deal.inputs.postcode.toUpperCase()}</td></tr>` : ''}
  ${deal.inputs.houseNumber ? `<tr><td style="padding:5px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9">Address</td><td style="padding:5px 10px;font-size:12px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9">${deal.inputs.houseNumber}, ${deal.inputs.postcode?.toUpperCase()}</td></tr>` : ''}
  ${deal.inputs.bedrooms ? `<tr><td style="padding:5px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9">Bedrooms</td><td style="padding:5px 10px;font-size:12px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9">${deal.inputs.bedrooms}</td></tr>` : ''}
  ${deal.inputs.epcRating ? `<tr><td style="padding:5px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9">EPC Rating</td><td style="padding:5px 10px;font-size:12px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9">${deal.inputs.epcRating}</td></tr>` : ''}
  <tr>
    <td style="padding:5px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9">Flood Risk</td>
    <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #f1f5f9">
      <div class="flood-pill"><div class="flood-dot"></div><span class="flood-text">${floodText}</span></div>
      ${deal.floodRiskAnnualProb ? `<span style="font-size:10px;color:#64748b;display:block;margin-top:3px">${deal.floodRiskAnnualProb} annual probability</span>` : ''}
    </td>
  </tr>
  ${deal.inputs.url ? `<tr><td style="padding:5px 10px;font-size:12px;color:#64748b">Listing</td><td style="padding:5px 10px;font-size:11px;font-weight:500;color:#2563EB;text-align:right;word-break:break-all">${deal.inputs.url}</td></tr>` : ''}
</table>

<h2>Recent Sold Prices Nearby</h2>
${soldPricesHtml(soldPrices)}

<footer>
  Property Deal Calculator &nbsp;&middot;&nbsp; Generated ${dateStr} &nbsp;&middot;&nbsp; For illustration only — not financial advice.
</footer>
</body>
</html>`;
}

export async function generateAndShareDealPDF(deal: DealReportData): Promise<void> {
  const results = calcDeal(deal.inputs);
  if (!results) throw new Error('Could not calculate deal results');

  const soldPrices = await fetchSoldPrices(deal.inputs.postcode).catch(() => []);

  const html = buildHtml(deal, results, soldPrices);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share: ${deal.label}`,
    UTI: 'com.adobe.pdf',
  });
}

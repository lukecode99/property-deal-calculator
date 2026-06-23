import { DealInputs, DealResults } from '../types';

function n(s: string): number {
  const v = parseFloat(s.replace(/,/g, ''));
  return isNaN(v) ? 0 : v;
}

// SDLT 2025/26 — additional dwelling (5% surcharge on all bands)
export function calcSDLT(price: number): { total: number; breakdown: { band: string; tax: number }[] } {
  const bands = [
    { label: '£0–£250k',     from: 0,        to: 250_000,   rate: 0.05 },
    { label: '£250k–£925k',  from: 250_000,  to: 925_000,   rate: 0.10 },
    { label: '£925k–£1.5m',  from: 925_000,  to: 1_500_000, rate: 0.15 },
    { label: 'Over £1.5m',   from: 1_500_000, to: Infinity,  rate: 0.17 },
  ];

  let total = 0;
  const breakdown: { band: string; tax: number }[] = [];
  for (const b of bands) {
    if (price <= b.from) break;
    const taxable = Math.min(price, b.to) - b.from;
    const tax = taxable * b.rate;
    total += tax;
    breakdown.push({ band: b.label, tax });
  }
  return { total, breakdown };
}

export function calcDeal(inputs: DealInputs): DealResults | null {
  const price = n(inputs.purchasePrice);
  if (price <= 0) return null;

  const { total: stampDuty, breakdown: sdltBreakdown } = calcSDLT(price);

  const solicitor = n(inputs.solicitorFees);
  const mortgageFee = n(inputs.mortgageFee);
  const other = n(inputs.other);
  const refurb = n(inputs.refurbCost) * (1 + n(inputs.refurbContingencyPct) / 100);

  const depositPct = n(inputs.depositPct) / 100;
  const interestRate = n(inputs.interestRate) / 100;

  const deposit = price * depositPct;
  const mortgageAmount = price - deposit;
  const monthlyMortgage = (mortgageAmount * interestRate) / 12;

  const totalPurchaseCosts = deposit + stampDuty + solicitor + mortgageFee + other;
  const totalInvested = totalPurchaseCosts + refurb;

  // BRR: new mortgage after refurb
  let newMortgageAmount: number | undefined;
  let valueExtracted: number | undefined;
  let capitalLeftIn: number | undefined;
  if (inputs.strategy === 'brr') {
    const renovatedValue = n(inputs.renovatedValue);
    if (renovatedValue > 0) {
      const newLTV = n(inputs.newMortgagePct) / 100;
      newMortgageAmount = renovatedValue * newLTV;
      valueExtracted = newMortgageAmount - mortgageAmount;
      capitalLeftIn = Math.max(0, totalInvested - Math.max(0, valueExtracted));
    }
  }

  // Monthly income
  let monthlyGrossIncome = 0;
  if (inputs.strategy === 'stl') {
    const nightlyRate = n(inputs.nightlyRate);
    const occupancy = n(inputs.occupancyPct) / 100;
    monthlyGrossIncome = nightlyRate * 30.4 * occupancy;
  } else {
    monthlyGrossIncome = n(inputs.rentPerMonth);
  }
  const annualGrossIncome = monthlyGrossIncome * 12;

  // OPEX (monthly)
  const serviceCharge = n(inputs.serviceCharge) / 12;
  const insurance = n(inputs.insurance) / 12;
  const mgmtFee = monthlyGrossIncome * (n(inputs.mgmtFeePct) / 100);
  const maintenance = monthlyGrossIncome * (n(inputs.maintenancePct) / 100);
  const voidAllowance = (monthlyGrossIncome * n(inputs.voidMonths)) / 12;

  const monthlyOpex = serviceCharge + insurance + mgmtFee + maintenance + voidAllowance;
  const monthlyNetCashflow = monthlyGrossIncome - monthlyMortgage - monthlyOpex;
  const annualNetCashflow = monthlyNetCashflow * 12;

  const effectiveCapital = inputs.strategy === 'brr' && capitalLeftIn != null && capitalLeftIn > 0
    ? capitalLeftIn
    : totalInvested;

  const grossYield = annualGrossIncome / price;
  const netYield = annualNetCashflow / price;
  const cashOnCash = effectiveCapital > 0 ? annualNetCashflow / effectiveCapital : 0;
  const roi = effectiveCapital > 0 ? annualNetCashflow / effectiveCapital : 0;

  // Stress tests (monthly cashflow)
  const stressRent10 = monthlyGrossIncome * 0.9 - monthlyMortgage - monthlyOpex;
  const stressMortgageRise = mortgageAmount * ((interestRate + 0.02) / 12);
  const stressRates2 = monthlyGrossIncome - stressMortgageRise - monthlyOpex;
  const stressVoid4w = monthlyGrossIncome - monthlyMortgage - monthlyOpex - (monthlyGrossIncome * (4 / 52));

  // 5-year projection
  const growth = n(inputs.capitalGrowthPct) / 100;
  const estimatedValue = price * Math.pow(1 + growth, 5);
  const capitalGrowth = estimatedValue - price;
  const cumulativeCashflow = annualNetCashflow * 5;
  const totalReturn = capitalGrowth + cumulativeCashflow;

  return {
    stampDuty,
    sdltBreakdown,
    totalPurchaseCosts,
    totalInvested,
    mortgageAmount,
    monthlyMortgage,
    newMortgageAmount,
    valueExtracted,
    capitalLeftIn,
    monthlyGrossIncome,
    annualGrossIncome,
    monthlyOpex,
    monthlyNetCashflow,
    annualNetCashflow,
    grossYield: grossYield * 100,
    netYield: netYield * 100,
    cashOnCash: cashOnCash * 100,
    roi: roi * 100,
    stress: {
      rent10pctDrop: stressRent10,
      rates2pctRise: stressRates2,
      void4weeks: stressVoid4w,
    },
    projection5yr: {
      estimatedValue,
      capitalGrowth,
      cumulativeCashflow,
      totalReturn,
    },
  };
}

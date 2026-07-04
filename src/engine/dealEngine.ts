import type { DealInputs, DealExtras, DealResults, FeeMode } from '../types';

function feeAmount(value: string, mode: FeeMode, loanAmount: number): number {
  const v = parseFloat(value) || 0;
  return mode === 'pct' ? loanAmount * (v / 100) : v;
}

function n(s: string): number {
  const v = parseFloat(s.replace(/,/g, ''));
  return isNaN(v) ? 0 : v;
}

// SDLT from 1 Apr 2025 — additional dwelling (standard bands, nil band back
// to £125k, plus the 5% surcharge on every band)
export function calcSDLT(price: number): { total: number; breakdown: { band: string; tax: number }[] } {
  const bands = [
    { label: '£0–£125k',     from: 0,         to: 125_000,   rate: 0.05 },
    { label: '£125k–£250k',  from: 125_000,   to: 250_000,   rate: 0.07 },
    { label: '£250k–£925k',  from: 250_000,   to: 925_000,   rate: 0.10 },
    { label: '£925k–£1.5m',  from: 925_000,   to: 1_500_000, rate: 0.15 },
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

export function calcDeal(inputs: DealInputs, extras: DealExtras = {}): DealResults | null {
  const price = n(inputs.purchasePrice);
  if (price <= 0) return null;

  const { total: stampDuty, breakdown: sdltBreakdown } = calcSDLT(price);

  const solicitor = n(inputs.solicitorFees);
  const mortgageFee = n(inputs.mortgageFee);
  const other = n(inputs.other);

  // Refurb total — simple or detailed
  let refurb: number;
  let detailedRefurbTotal: number | undefined;
  const contingencyMult = 1 + n(inputs.refurbContingencyPct) / 100;

  if (inputs.refurbMode === 'detailed') {
    const base =
      n(inputs.rd_ripOutSkip) + n(inputs.rd_kitchen) + n(inputs.rd_electrics) +
      n(inputs.rd_bathroom) + n(inputs.rd_plastering) + n(inputs.rd_internalDoors) +
      n(inputs.rd_externalDoors) + n(inputs.rd_windows) + n(inputs.rd_tiling) +
      n(inputs.rd_carpet) + n(inputs.rd_boilerHeating) + n(inputs.rd_roof) +
      n(inputs.rd_dampProofing) + (extras.customRefurbTotal ?? 0);
    detailedRefurbTotal = base;
    refurb = base * contingencyMult;
  } else {
    refurb = n(inputs.refurbCost) * contingencyMult;
  }

  const holdingCosts = n(inputs.holdingCosts);

  // BRR: Initial financing cost (bridging)
  const isBrr = inputs.refinanceAfterRefurb === 'yes';
  const brrBridgePurchase = isBrr && inputs.brrPurchaseMethod !== 'mortgage';
  let bridgeLoan = 0;
  let initialFinancingCost = 0;
  let initialFinancingInterest = 0;
  if (isBrr) {
    // Bridge-purchase: the bridge buys the property, defaulting to the full price.
    // Mortgage-purchase: the bridge (if any) only funds the refurb — default £0.
    bridgeLoan = brrBridgePurchase ? (n(inputs.bridgingAmount) || price) : n(inputs.bridgingAmount);
    if (bridgeLoan > 0) {
      const months = n(inputs.bridgingDurationMonths) || 0;
      const arrangementFee = feeAmount(inputs.bridgingArrangementFee, inputs.bridgingArrangementFeeMode, bridgeLoan);
      const valuationFee = feeAmount(inputs.bridgingValuationFee, inputs.bridgingValuationFeeMode, bridgeLoan);
      const monthlyInterest = bridgeLoan * (n(inputs.bridgingMonthlyInterestRate) / 100);
      initialFinancingInterest = monthlyInterest * months;
      initialFinancingCost = arrangementFee + valuationFee + initialFinancingInterest +
        n(inputs.bridgingExitFee) + n(inputs.bridgingBrokerFees) + n(inputs.bridgingOtherFees);
    }
  }

  // STL one-time setup cost (added to total invested)
  const stlSetupCost = inputs.strategy === 'stl'
    ? n(inputs.stl_furnishing) + (extras.customStlSetupTotal ?? 0)
    : 0;

  // STL monthly costs (added to OPEX)
  const stlMonthlyCosts = inputs.strategy === 'stl'
    ? n(inputs.stl_cleaning) + n(inputs.stl_gardening) + n(inputs.stl_gasElectric) +
      n(inputs.stl_internet) + n(inputs.stl_additionalMaintenance) +
      ((extras.customStlMonthlyTotal ?? 0))
    : 0;

  // HMO one-time setup costs (licence is recurring — amortised into monthly below)
  const hmoRooms = Math.max(1, n(inputs.hmoRooms) || 1);
  const hmoSetupCost = inputs.strategy === 'hmo'
    ? n(inputs.hmoFurnishingPerRoom) * hmoRooms + n(inputs.hmoFireSafety)
    : 0;

  // HMO monthly costs (utilities if bills included + cleaning + licence amortised over its term)
  const hmoLicenceMonthly = inputs.strategy === 'hmo'
    ? n(inputs.hmoLicenceFee) / (Math.max(1, n(inputs.hmoLicenceYears) || 5) * 12)
    : 0;
  const hmoMonthlyCosts = inputs.strategy === 'hmo'
    ? (inputs.hmoBillsIncluded === 'yes' ? n(inputs.hmoUtilitiesMonthly) : 0) + n(inputs.hmoCleaningMonthly) + hmoLicenceMonthly
    : 0;

  // Monthly income (calculated first — needed for commercial mortgage)
  let monthlyGrossIncome = 0;
  if (inputs.strategy === 'stl') {
    monthlyGrossIncome = n(inputs.nightlyRate) * 30.4 * (n(inputs.occupancyPct) / 100);
  } else if (inputs.strategy === 'hmo') {
    monthlyGrossIncome = hmoRooms * n(inputs.hmoRentPerRoom) * (1 - n(inputs.hmoVoidWeeksPerRoom) / 52);
  } else {
    monthlyGrossIncome = n(inputs.rentPerMonth);
  }
  const annualGrossIncome = monthlyGrossIncome * 12;

  // OPEX (monthly, no mortgage dependency)
  const serviceCharge = n(inputs.serviceCharge) / 12;
  const insurance = n(inputs.insurance) / 12;
  const mgmtFeePct = n(inputs.mgmtFeePct) / 100;
  const maintPct = n(inputs.maintenancePct) / 100;
  const voidMonths = n(inputs.voidMonths);
  const mgmtFee = monthlyGrossIncome * mgmtFeePct;
  const maintenance = monthlyGrossIncome * maintPct;
  // Voids: HMO already prices voids per room (void weeks), STL already scales
  // income by occupancy % — a further voidMonths deduction would double-count.
  const voidApplies = inputs.strategy !== 'hmo' && inputs.strategy !== 'stl';
  const voidAllowance = voidApplies ? (monthlyGrossIncome * voidMonths) / 12 : 0;
  const gasCertMonthly = n(inputs.gasCertAnnual ?? '60') / 12;
  const elecCertMonthly = n(inputs.elecCertFiveYear ?? '200') / 60;
  const monthlyOpex = serviceCharge + insurance + mgmtFee + maintenance + voidAllowance + stlMonthlyCosts + hmoMonthlyCosts + gasCertMonthly + elecCertMonthly;

  // Mortgage — derive base value from valuation input, then apply LTV
  const depositPct = n(inputs.depositPct) / 100;
  const interestRate = n(inputs.interestRate) / 100;

  const isCommercial = inputs.mortgageType === 'commercial' &&
    (inputs.strategy === 'hmo' || inputs.strategy === 'stl');

  const commercialValuation = isCommercial ? n(inputs.commercialValuation) : 0;
  const mortgageValuationStd = !isCommercial ? n(inputs.mortgageValuation) : 0;
  const mortgageBase = isCommercial
    ? (commercialValuation > 0 ? commercialValuation : price)
    : (mortgageValuationStd > 0 ? mortgageValuationStd : price);

  let mortgageAmount = Math.min(mortgageBase * (1 - depositPct), price);
  let deposit = Math.max(0, price - mortgageAmount);
  if (brrBridgePurchase) {
    // Bridge buys the property — no day-1 term mortgage. Day-1 cash covers what
    // the bridge doesn't; the refinance below replaces the bridge.
    mortgageAmount = 0;
    deposit = Math.max(0, price - bridgeLoan);
  }
  const commercialInvestmentValue = isCommercial && commercialValuation > 0 ? commercialValuation : undefined;

  const monthlyMortgage = interestRate > 0 ? (mortgageAmount * interestRate) / 12 : 0;

  // Future rate mortgage payment (for stress test + UI display)
  const futureRatePct = n(inputs.mortgageFutureRate);
  const monthlyFutureMortgage = futureRatePct > 0
    ? (mortgageAmount * (futureRatePct / 100)) / 12
    : undefined;

  const totalPurchaseCosts = deposit + stampDuty + solicitor + mortgageFee + other;
  const totalInvested = totalPurchaseCosts + refurb + holdingCosts + stlSetupCost + hmoSetupCost + initialFinancingCost;

  // Capital on purchase
  const fairValue = n(inputs.estimatedFairValue);
  const capitalOnPurchase = fairValue > 0 ? fairValue - price : undefined;

  // BRR: new mortgage after refurb
  let newMortgageAmount: number | undefined;
  let monthlyPostRefiMortgage: number | undefined;
  let valueExtracted: number | undefined;
  let capitalLeftIn: number | undefined;
  let allCapitalOut: boolean | undefined;
  if (isBrr) {
    const renovatedValue = n(inputs.renovatedValue);
    if (renovatedValue > 0) {
      const newLTV = n(inputs.newMortgagePct) / 100;
      newMortgageAmount = renovatedValue * newLTV;
      monthlyPostRefiMortgage = interestRate > 0 ? (newMortgageAmount * interestRate) / 12 : 0;
      // Extraction = new debt minus the debt it repays (bridge and/or day-1 mortgage)
      valueExtracted = newMortgageAmount - bridgeLoan - mortgageAmount;
      const rawLeftIn = totalInvested - Math.max(0, valueExtracted);
      allCapitalOut = rawLeftIn <= 0;
      capitalLeftIn = Math.max(0, rawLeftIn);
    }
  }

  // BRR ongoing cashflow is on the refinanced mortgage, not the day-1 finance
  const monthlyOngoingMortgage = monthlyPostRefiMortgage ?? monthlyMortgage;
  const ongoingDebt = newMortgageAmount ?? mortgageAmount;

  const monthlyNetCashflow = monthlyGrossIncome - monthlyOngoingMortgage - monthlyOpex;
  const annualNetCashflow = monthlyNetCashflow * 12;

  const effectiveCapital = capitalLeftIn != null ? capitalLeftIn : totalInvested;

  const grossYield = price > 0 ? (annualGrossIncome / price) * 100 : 0;
  const netYield = price > 0 ? (annualNetCashflow / price) * 100 : 0;
  // effectiveCapital of 0 means the refinance pulled everything out — CoC is
  // infinite; allCapitalOut tells the UI to render that state.
  const cashOnCash = effectiveCapital > 0 ? (annualNetCashflow / effectiveCapital) * 100 : 0;
  const roi = cashOnCash;

  // Post-tax cashflow. Personal: Section 24 — interest is not deductible, but
  // earns a 20% credit against the bill. Ltd Co: interest deductible, CT at the
  // 19% small-profits rate / 25% main rate with marginal relief between.
  let tax: DealResults['tax'];
  if (monthlyGrossIncome > 0) {
    const annualInterest = monthlyOngoingMortgage * 12;
    const annualOpex = monthlyOpex * 12;
    let taxableProfit: number;
    let annualTax: number;
    if (inputs.ownership === 'company') {
      taxableProfit = Math.max(0, annualGrossIncome - annualOpex - annualInterest);
      if (taxableProfit <= 50_000) annualTax = taxableProfit * 0.19;
      else if (taxableProfit >= 250_000) annualTax = taxableProfit * 0.25;
      else annualTax = taxableProfit * 0.25 - (250_000 - taxableProfit) * (3 / 200);
    } else {
      taxableProfit = Math.max(0, annualGrossIncome - annualOpex);
      const bandRate = inputs.taxBand === 'basic' ? 0.20 : inputs.taxBand === 'additional' ? 0.45 : 0.40;
      const interestCredit = annualInterest * 0.20;
      annualTax = Math.max(0, taxableProfit * bandRate - interestCredit);
    }
    const postTaxAnnualCashflow = annualNetCashflow - annualTax;
    tax = {
      taxableProfit,
      annualTax,
      postTaxAnnualCashflow,
      postTaxMonthlyCashflow: postTaxAnnualCashflow / 12,
      postTaxCoC: effectiveCapital > 0 ? (postTaxAnnualCashflow / effectiveCapital) * 100 : 0,
    };
  }

  // Lender ICR check — rent must cover 125%/145% of the interest-only payment
  // at the stress rate lenders actually test: max(5.5%, pay rate + 2%)
  let icr: DealResults['icr'];
  if (ongoingDebt > 0 && monthlyGrossIncome > 0) {
    const icrStressRate = Math.max(5.5, interestRate * 100 + 2);
    const stressedPayment = (ongoingDebt * (icrStressRate / 100)) / 12;
    const ratio = (monthlyGrossIncome / stressedPayment) * 100;
    icr = {
      ratio,
      stressRate: icrStressRate,
      pass125: ratio >= 125,
      pass145: ratio >= 145,
    };
  }

  // Stress tests (monthly cashflow, on the ongoing debt)
  const stressRent10 = monthlyGrossIncome * 0.9 - monthlyOngoingMortgage - monthlyOpex;
  const stressMortgage = futureRatePct > 0
    ? (ongoingDebt * (futureRatePct / 100)) / 12
    : ongoingDebt * ((interestRate + 0.02) / 12);
  const stressRates = monthlyGrossIncome - stressMortgage - monthlyOpex;
  const stressVoid4w = monthlyGrossIncome - monthlyOngoingMortgage - monthlyOpex - (monthlyGrossIncome * (4 / 52));

  // 5-year projection with annual income increase + mortgage glide path
  const growth = n(inputs.capitalGrowthPct) / 100;
  const incIncrease = n(inputs.annualIncomeIncreasePct) / 100;
  // Base value for growth: renovated value (BRR) > estimated fair value > purchase price
  const renovatedVal = n(inputs.renovatedValue);
  const baseValueForGrowth =
    inputs.refinanceAfterRefurb === 'yes' && renovatedVal > 0 ? renovatedVal
    : fairValue > 0 ? fairValue
    : price;
  const estimatedValue = baseValueForGrowth * Math.pow(1 + growth, 5);
  const capitalGrowth = estimatedValue - baseValueForGrowth;

  const initialTerm = Math.min(5, Math.max(1, Math.round(n(inputs.mortgageInitialTerm)) || 2));
  // After fixed term ends, mortgage reverts to expected future rate (or stays same if not set)
  const futureMonthlyMortgage = futureRatePct > 0
    ? (ongoingDebt * (futureRatePct / 100)) / 12
    : monthlyOngoingMortgage;

  let cumulativeCashflow = 0;
  for (let yr = 1; yr <= 5; yr++) {
    const factor = Math.pow(1 + incIncrease, yr - 1);
    const adjIncome = monthlyGrossIncome * factor;
    const adjMgmtFee = adjIncome * mgmtFeePct;
    const adjMaintenance = adjIncome * maintPct;
    const adjVoid = voidApplies ? (adjIncome * voidMonths) / 12 : 0;
    const adjOpex = serviceCharge + insurance + adjMgmtFee + adjMaintenance + adjVoid + stlMonthlyCosts + hmoMonthlyCosts + gasCertMonthly + elecCertMonthly;
    const yrMortgage = yr <= initialTerm ? monthlyOngoingMortgage : futureMonthlyMortgage;
    const adjNet = (adjIncome - yrMortgage - adjOpex) * 12;
    cumulativeCashflow += adjNet;
  }

  const totalReturn = capitalGrowth + cumulativeCashflow;

  return {
    stampDuty,
    sdltBreakdown,
    totalPurchaseCosts,
    totalInvested,
    capitalOnPurchase,
    detailedRefurbTotal,
    initialFinancingCost: initialFinancingCost > 0 ? initialFinancingCost : undefined,
    initialFinancingInterest: initialFinancingInterest > 0 ? initialFinancingInterest : undefined,
    deposit,
    mortgageAmount,
    monthlyMortgage,
    monthlyFutureMortgage,
    newMortgageAmount,
    monthlyPostRefiMortgage,
    valueExtracted,
    capitalLeftIn,
    allCapitalOut,
    monthlyGrossIncome,
    annualGrossIncome,
    stlSetupCost,
    stlMonthlyCosts,
    hmoSetupCost,
    hmoMonthlyCosts,
    monthlyOpex,
    monthlyNetCashflow,
    annualNetCashflow,
    grossYield,
    netYield,
    cashOnCash,
    roi,
    commercialInvestmentValue,
    tax,
    icr,
    stress: {
      rent10pctDrop: stressRent10,
      ratesAtFutureRate: stressRates,
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

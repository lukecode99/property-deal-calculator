export type Strategy = 'btl' | 'brr' | 'stl';
export type Ownership = 'personal' | 'company';

export interface DealInputs {
  strategy: Strategy;
  ownership: Ownership;

  // Property
  purchasePrice: string;
  renovatedValue: string;   // BRR only

  // Purchase costs
  solicitorFees: string;
  mortgageFee: string;
  other: string;

  // Refurb
  refurbCost: string;
  refurbContingencyPct: string;

  // Finance
  depositPct: string;
  interestRate: string;
  mortgageTerm: string;     // years (for repayment calc display only; IO by default)
  newMortgagePct: string;   // BRR: LTV of new mortgage after refurb

  // Income
  rentPerMonth: string;     // BTL / BRR
  nightlyRate: string;      // STL
  occupancyPct: string;     // STL (default 70)

  // OPEX
  serviceCharge: string;
  insurance: string;
  mgmtFeePct: string;
  maintenancePct: string;   // % of rent (default 5%)
  voidMonths: string;       // annual void allowance (default 0.5)

  // Projections
  capitalGrowthPct: string; // 5yr annual growth default 3%
}

export interface DealResults {
  // Costs
  stampDuty: number;
  sdltBreakdown: { band: string; tax: number }[];
  totalPurchaseCosts: number;
  totalInvested: number;

  // Finance
  mortgageAmount: number;
  monthlyMortgage: number;

  // BRR
  newMortgageAmount?: number;
  valueExtracted?: number;
  capitalLeftIn?: number;

  // Income
  monthlyGrossIncome: number;
  annualGrossIncome: number;

  // Cashflow
  monthlyOpex: number;
  monthlyNetCashflow: number;
  annualNetCashflow: number;

  // Yields & returns
  grossYield: number;
  netYield: number;
  cashOnCash: number;
  roi: number;

  // Stress tests
  stress: {
    rent10pctDrop: number;
    rates2pctRise: number;
    void4weeks: number;
  };

  // 5yr projection
  projection5yr: {
    estimatedValue: number;
    capitalGrowth: number;
    cumulativeCashflow: number;
    totalReturn: number;
  };
}

export const DEFAULT_INPUTS: DealInputs = {
  strategy: 'btl',
  ownership: 'personal',
  purchasePrice: '',
  renovatedValue: '',
  solicitorFees: '2000',
  mortgageFee: '1000',
  other: '0',
  refurbCost: '0',
  refurbContingencyPct: '10',
  depositPct: '25',
  interestRate: '5.5',
  mortgageTerm: '25',
  newMortgagePct: '75',
  rentPerMonth: '',
  nightlyRate: '',
  occupancyPct: '70',
  serviceCharge: '0',
  insurance: '800',
  mgmtFeePct: '10',
  maintenancePct: '5',
  voidMonths: '0.5',
  capitalGrowthPct: '3',
};

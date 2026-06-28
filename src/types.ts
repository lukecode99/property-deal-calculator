export type Strategy = 'btl' | 'stl' | 'hmo';
export type Ownership = 'personal' | 'company';
export type RefurbMode = 'simple' | 'detailed';
export type FeeMode = 'pct' | 'fixed';
export type MortgageType = 'standard' | 'commercial';

export interface DealInputs {
  strategy: Strategy;
  refinanceAfterRefurb: 'yes' | 'no';  // BTL only: treat as BRR when yes
  ownership: Ownership;

  // Property details
  houseNumber: string;
  postcode: string;
  url: string;

  // Further details (optional toggle)
  furtherDetails: 'yes' | 'no';
  epcRating: string;
  floorSpace: string;
  bedrooms: string;
  bathrooms: string;
  otherRooms: string;

  // Property
  purchasePrice: string;       // "Offer Price" in UI
  estimatedFairValue: string;  // to calculate capital on purchase
  renovatedValue: string;      // BRR only

  // Purchase costs
  solicitorFees: string;
  other: string;

  // Refurb
  refurbMode: RefurbMode;
  refurbCost: string;               // simple mode
  refurbContingencyPct: string;
  rd_ripOutSkip: string;
  rd_kitchen: string;
  rd_electrics: string;
  rd_bathroom: string;
  rd_plastering: string;
  rd_internalDoors: string;
  rd_externalDoors: string;
  rd_windows: string;
  rd_tiling: string;
  rd_carpet: string;
  rd_boilerHeating: string;
  rd_roof: string;
  rd_dampProofing: string;

  // Refurb holding costs
  holdingCosts: string;

  // BRR Initial Financing (bridging only)
  // Bridging fields
  bridgingAmount: string;
  bridgingDurationMonths: string;
  bridgingArrangementFeeMode: FeeMode;
  bridgingArrangementFee: string;    // % of loan or £
  bridgingValuationFeeMode: FeeMode;
  bridgingValuationFee: string;      // % of loan or £
  bridgingMonthlyInterestRate: string; // % per month
  bridgingExitFee: string;           // £
  bridgingBrokerFees: string;        // £
  bridgingOtherFees: string;         // £

  // Long-term Finance
  mortgageFee: string;
  depositPct: string;
  interestRate: string;
  mortgageInitialTerm: string;
  mortgageFutureRate: string;
  mortgageTerm: string;
  newMortgagePct: string;

  // Mortgage valuation (optional — if lender's value differs from purchase price)
  mortgageValuation: string;   // BTL: lender's assessed value
  mortgageType: MortgageType;  // HMO/STL: standard or commercial
  commercialValuation: string; // HMO/STL commercial: income-based valuation

  // Income
  rentPerMonth: string;
  nightlyRate: string;
  occupancyPct: string;

  // HMO fields
  hmoRooms: string;
  hmoRentPerRoom: string;
  hmoVoidWeeksPerRoom: string;
  hmoBillsIncluded: 'yes' | 'no';
  hmoUtilitiesMonthly: string;
  hmoCleaningMonthly: string;
  hmoLicenceFee: string;
  hmoLicenceYears: string;
  hmoFurnishingPerRoom: string;
  hmoFireSafety: string;

  // STL costs
  stl_furnishing: string;
  stl_cleaning: string;
  stl_gardening: string;
  stl_gasElectric: string;
  stl_internet: string;
  stl_additionalMaintenance: string;

  // OPEX
  serviceCharge: string;
  insurance: string;
  mgmtFeePct: string;
  maintenancePct: string;
  voidMonths: string;
  gasCertAnnual: string;
  elecCertFiveYear: string;

  // Projections
  capitalGrowthPct: string;
  annualIncomeIncreasePct: string;
}

export interface DealExtras {
  customRefurbTotal?: number;
  customStlSetupTotal?: number;
  customStlMonthlyTotal?: number;
}

export interface DealResults {
  stampDuty: number;
  sdltBreakdown: { band: string; tax: number }[];
  totalPurchaseCosts: number;
  totalInvested: number;
  capitalOnPurchase?: number;
  detailedRefurbTotal?: number;

  // Initial financing (BRR)
  initialFinancingCost?: number;
  initialFinancingInterest?: number;

  mortgageAmount: number;
  monthlyMortgage: number;
  monthlyFutureMortgage?: number;

  newMortgageAmount?: number;
  valueExtracted?: number;
  capitalLeftIn?: number;

  monthlyGrossIncome: number;
  annualGrossIncome: number;

  stlSetupCost: number;
  stlMonthlyCosts: number;
  hmoSetupCost: number;
  hmoMonthlyCosts: number;

  monthlyOpex: number;
  monthlyNetCashflow: number;
  annualNetCashflow: number;

  grossYield: number;
  netYield: number;
  cashOnCash: number;
  roi: number;

  commercialInvestmentValue?: number;

  stress: {
    rent10pctDrop: number;
    ratesAtFutureRate: number;
    void4weeks: number;
  };

  projection5yr: {
    estimatedValue: number;
    capitalGrowth: number;
    cumulativeCashflow: number;
    totalReturn: number;
  };
}

export const DEFAULT_INPUTS: DealInputs = {
  strategy: 'btl',
  refinanceAfterRefurb: 'no',
  ownership: 'personal',
  houseNumber: '',
  postcode: '',
  url: '',
  furtherDetails: 'no',
  epcRating: '',
  floorSpace: '',
  bedrooms: '',
  bathrooms: '',
  otherRooms: '',
  purchasePrice: '',
  estimatedFairValue: '',
  renovatedValue: '',
  solicitorFees: '2000',
  mortgageFee: '1000',
  other: '0',
  refurbMode: 'simple',
  refurbCost: '0',
  refurbContingencyPct: '10',
  rd_ripOutSkip: '', rd_kitchen: '', rd_electrics: '', rd_bathroom: '',
  rd_plastering: '', rd_internalDoors: '', rd_externalDoors: '', rd_windows: '',
  rd_tiling: '', rd_carpet: '', rd_boilerHeating: '', rd_roof: '', rd_dampProofing: '',
  holdingCosts: '',
  bridgingAmount: '', bridgingDurationMonths: '6',
  bridgingArrangementFeeMode: 'pct', bridgingArrangementFee: '2',
  bridgingValuationFeeMode: 'fixed', bridgingValuationFee: '500',
  bridgingMonthlyInterestRate: '0.75',
  bridgingExitFee: '', bridgingBrokerFees: '', bridgingOtherFees: '',
  depositPct: '25',
  interestRate: '5.5',
  mortgageInitialTerm: '2',
  mortgageFutureRate: '',
  mortgageTerm: '25',
  newMortgagePct: '75',
  rentPerMonth: '', nightlyRate: '', occupancyPct: '70',
  hmoRooms: '5', hmoRentPerRoom: '', hmoVoidWeeksPerRoom: '2',
  hmoBillsIncluded: 'yes', hmoUtilitiesMonthly: '', hmoCleaningMonthly: '',
  hmoLicenceFee: '1000', hmoLicenceYears: '5',
  hmoFurnishingPerRoom: '1500', hmoFireSafety: '',
  stl_furnishing: '', stl_cleaning: '', stl_gardening: '',
  stl_gasElectric: '', stl_internet: '', stl_additionalMaintenance: '',
  serviceCharge: '0', insurance: '800', mgmtFeePct: '10',
  maintenancePct: '5', voidMonths: '0.5',
  gasCertAnnual: '60', elecCertFiveYear: '200',
  capitalGrowthPct: '3', annualIncomeIncreasePct: '2',
  mortgageValuation: '',
  mortgageType: 'standard',
  commercialValuation: '',
};

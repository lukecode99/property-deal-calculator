# Property Deal Calculator — Implementation Plan

**Date:** 2026-06-22  
**Stack:** React Native / Expo (same as salary calc), TypeScript, AsyncStorage  
**Target:** UK BTL/BRR/STL investors  

---

## Spreadsheet Analysis (from Luke's example)

Luke's spreadsheet covers 4 strategies:
- **BRR** (Buy Refurb Refinance): Purchase → refurb → new mortgage, capital extracted
- **BTL**: Standard buy-to-let, interest-only mortgage
- **Short Term Lets (STL/AirBnB)**: Nightly rate + occupancy %
- **HMO**: Multiple rooms, per-room rates

Key calculated fields from spreadsheet:
- Total capital investment = Deposit + Stamp Duty + Solicitor + Mortgage fee + Lease extension + Refurb
- BRR: Value Extracted = New Mortgage − Old Mortgage; Capital Left In = Total invested − Value Extracted
- Monthly cashflow = Rent − Mortgage − OPEX
- ROI = Annual profit / Capital invested
- 5-year: Est value = Purchase × (1 + growth%)^5, Capital growth = value increase + cumulative profit

---

## Perplexity Research Findings

Key insights from research:
1. **Competitor apps**: DealCheck, Lendlord (UK-specific), Budgerty, RefurbCalculator
2. **Most-wanted metrics**: cash-on-cash return, IRR, gross/net yield, LTV, rent-to-value ratio
3. **Critical UK specifics**: SDLT surcharge (5% on additional dwellings from Oct 2024), Section 24 tax impact
4. **Top UX mistake**: spreadsheet-style clutter before users see any results
5. **Data opportunity**: Land Registry sold prices, EPC data, BTL mortgage rate feeds

---

## 5 Suggested Improvements (beyond the brief)

### 1. SDLT Auto-Calculator
Auto-calculate stamp duty including the 5% additional dwelling surcharge (changed from 3% to 5% Oct 2024). Show breakdown: SDLT bands + surcharge. Saves investors calculating manually.

### 2. Ownership Structure: Personal vs Company (Ltd)
Ask upfront: "Are you buying in your personal name or through a limited company?"

- **Personal name**: Section 24 applies — mortgage interest NOT deductible. Only 20% tax credit. For higher-rate taxpayers this adds ~20% extra tax on the interest vs company route. Show true post-tax profit.
- **Company (Ltd)**: mortgage interest IS deductible as a business expense. Pay corporation tax on profits (19% small profits / 25% main rate). Show pre-extraction profit + note on dividend extraction costs.

This one question changes the entire profit calculation — most competing apps don't model it at all.

### 3. Cash-on-Cash Return
Annual cashflow ÷ total cash invested. Investors compare this across deals — more useful than ROI for ongoing cashflow assessment.

### 4. Stress Test Mode
One-tap: show profit if rent drops 10%, rates rise 2%, or 4-week void. Helps investors understand deal resilience without manual re-entry.

### 5. BRR Cash Recycling Summary
For BRR deals: show capital recycled vs left in, and how many repeat deals the recycled capital could fund. Unique "deal machine" metric.

---

## Implementation Plan

### Phase 1: Core Calculator
- New Expo app `property-deal-calc` with same colour scheme (dark/green)
- Strategy selector: BTL / BRR / STL (tabs or segmented control)
- Input sections: Property, Purchase costs, Refurb, Finance, Income, OPEX
- Results: monthly/annual cashflow, gross yield, net yield, cash-on-cash, ROI
- SDLT auto-calculator built in

### Phase 2: Deal Saving + Property Photo
- AsyncStorage for saving deals (free: 2 max, paywall for more)
- Deal status: Bought / Offered / Dropped
- Property photo: user upload via expo-image-picker, OR Google Street View snapshot API by postcode
- Comments section per deal
- Revenue: expo-ads-admob for banner ads

### Phase 3: Charts + Projections
- 5-year projection chart (line chart: capital value, cumulative returns)
- Monthly cashflow bar chart
- Use Victory Native or react-native-svg + custom

### Phase 4: Paywall + BRR Advanced
- RevenueCat or in-app purchase for £5.99 "unlimited deals" unlock
- BRR cash recycling calculator
- Stress test mode
- Section 24 tax toggle

### Phase 5: Future (Luke's roadmap)
- Land Registry sold price lookup (GOV.UK open API)
- BTL mortgage rate feed (manually maintained or web scrape)

---

## Data Model

```typescript
interface Deal {
  id: string;
  name: string;
  createdAt: string;
  status: 'offered' | 'bought' | 'dropped';
  strategy: 'btl' | 'brr' | 'stl' | 'hmo';
  property: {
    postcode: string;
    url: string;        // Rightmove/Zoopla link
    photoUri?: string;
  };
  purchase: {
    price: number;
    stampDuty: number;    // auto-calculated, overridable
    solicitor: number;
    mortgageFee: number;
    leaseExtension: number;
    other: number;
  };
  refurb: {
    total: number;          // or itemised
    contingencyPct: number; // default 10%
  };
  finance: {
    depositPct: number;
    interestRate: number;
    // BRR only:
    renovatedValue?: number;
    newMortgagePct?: number;
  };
  income: {
    rentPerMonth: number;         // BTL/HMO
    nightlyRate?: number;         // STL
    occupancyPct?: number;        // STL (default 70%)
    rooms?: number;               // HMO
    avgRoomRate?: number;         // HMO
  };
  opex: {
    serviceCharge: number;
    insurance: number;
    mgmtFeePct: number;           // % of rent
    gasElecCheck: number;
    cleaning: number;             // STL
    councilTax: number;           // STL
    other: number;
  };
  projections: {
    capitalGrowthPct5yr: number;  // default 15%
  };
  comments: string[];
}
```

---

## Screen Map

```
Tab 1: Deals List
  └── Floating Add button → Deal Setup screen

Tab 2: Calculator (quick-calc, no save)

Deal Setup screens (wizard flow):
  1. Strategy select (BTL / BRR / STL)
  2. Property details (postcode, URL, photo)
  3. Purchase & refurb costs
  4. Finance (deposit %, rate)
  5. Income & OPEX
  → Results screen (charts + metrics)
     └── Save deal / update status / add comment
```

---

## SDLT Logic (2025/26)

Additional dwelling surcharge = 5% on all bands from Oct 2024.

| Band          | Standard rate | Additional dwelling |
|---------------|--------------|---------------------|
| Up to £250k   | 0%           | 5%                  |
| £250k–£925k   | 5%           | 10%                 |
| £925k–£1.5m   | 10%          | 15%                 |
| Over £1.5m    | 12%          | 17%                 |

---

## Monetisation

- Banner ads (AdMob): shown on calculator and deal list screens
- Paywall: saving 3rd+ deal requires £5.99 one-off unlock ("Unlimited Deals")
- RevenueCat for IAP handling (iOS + Android) or simple AsyncStorage flag for web

---

## Deploy

Same pipeline as salary calc: Expo → GitHub Pages at `lukecode99.github.io/property-deal-calc/`

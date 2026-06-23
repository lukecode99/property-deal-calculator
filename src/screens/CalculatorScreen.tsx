import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, font } from '../theme';
import { DealInputs, Strategy, Ownership, DEFAULT_INPUTS } from '../types';
import { calcDeal } from '../engine/dealEngine';
import { InputField } from '../components/InputField';
import { ResultRow, SectionDivider, fmtGbp, fmtPct } from '../components/ResultRow';

const STRATEGIES: { key: Strategy; label: string; color: string }[] = [
  { key: 'btl', label: 'BTL', color: colors.btl },
  { key: 'brr', label: 'BRR', color: colors.brr },
  { key: 'stl', label: 'STL / AirBnB', color: colors.stl },
];

export function CalculatorScreen() {
  const [inputs, setInputs] = useState<DealInputs>(DEFAULT_INPUTS);
  const [showSdlt, setShowSdlt] = useState(false);
  const [showStress, setShowStress] = useState(false);
  const [showProjection, setShowProjection] = useState(false);

  function set(field: keyof DealInputs) {
    return (val: string) => setInputs(prev => ({ ...prev, [field]: val }));
  }

  const results = useMemo(() => calcDeal(inputs), [inputs]);

  const stratColor = STRATEGIES.find(s => s.key === inputs.strategy)?.color ?? colors.primary;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>

        {/* Header */}
        <Text style={styles.title}>Property Deal Calculator</Text>
        <Text style={styles.subtitle}>UK Buy-to-Let, BRR & Short-Term Lets</Text>

        {/* Strategy tabs */}
        <View style={styles.tabs}>
          {STRATEGIES.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.tab, inputs.strategy === s.key && { backgroundColor: s.color + '22', borderColor: s.color }]}
              onPress={() => setInputs(prev => ({ ...prev, strategy: s.key }))}
            >
              <Text style={[styles.tabText, inputs.strategy === s.key && { color: s.color }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ownership toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.label}>Ownership Structure</Text>
              <Text style={styles.hint}>Affects Section 24 tax treatment</Text>
            </View>
            <View style={styles.ownershipToggle}>
              <TouchableOpacity
                style={[styles.ownerBtn, inputs.ownership === 'personal' && styles.ownerBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, ownership: 'personal' }))}
              >
                <Text style={[styles.ownerBtnText, inputs.ownership === 'personal' && styles.ownerBtnTextActive]}>Personal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ownerBtn, inputs.ownership === 'company' && styles.ownerBtnActive]}
                onPress={() => setInputs(prev => ({ ...prev, ownership: 'company' }))}
              >
                <Text style={[styles.ownerBtnText, inputs.ownership === 'company' && styles.ownerBtnTextActive]}>Ltd Co</Text>
              </TouchableOpacity>
            </View>
          </View>
          {inputs.ownership === 'personal' && (
            <Text style={styles.taxNote}>⚠️ Section 24: mortgage interest not fully deductible. Higher-rate taxpayers pay more tax.</Text>
          )}
          {inputs.ownership === 'company' && (
            <Text style={styles.taxNoteGreen}>✓ Ltd Co: mortgage interest deductible as expense. Corporation tax on profits.</Text>
          )}
        </View>

        {/* Purchase */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Purchase Price</Text>
          <InputField label="Purchase Price" value={inputs.purchasePrice} onChangeText={set('purchasePrice')} prefix="£" placeholder="e.g. 180000" />
          {inputs.strategy === 'brr' && (
            <InputField label="Renovated Value (GDV)" value={inputs.renovatedValue} onChangeText={set('renovatedValue')} prefix="£" placeholder="e.g. 250000" hint="Value after refurb — used to calculate new mortgage" />
          )}
        </View>

        {/* Purchase costs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Purchase Costs</Text>
          <InputField label="Deposit %" value={inputs.depositPct} onChangeText={set('depositPct')} suffix="%" placeholder="25" />
          <InputField label="Solicitor Fees" value={inputs.solicitorFees} onChangeText={set('solicitorFees')} prefix="£" />
          <InputField label="Mortgage Arrangement Fee" value={inputs.mortgageFee} onChangeText={set('mortgageFee')} prefix="£" />
          <InputField label="Other Costs" value={inputs.other} onChangeText={set('other')} prefix="£" />
          {results && (
            <TouchableOpacity style={styles.sdltToggle} onPress={() => setShowSdlt(v => !v)}>
              <Text style={styles.sdltLabel}>SDLT (Stamp Duty): {fmtGbp(results.stampDuty)}</Text>
              <Text style={styles.sdltChevron}>{showSdlt ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          )}
          {showSdlt && results && (
            <View style={styles.sdltBreakdown}>
              <Text style={styles.sdltNote}>Additional dwelling surcharge (5%) applied to all bands</Text>
              {results.sdltBreakdown.map(b => (
                <ResultRow key={b.band} label={b.band} value={fmtGbp(b.tax)} indent muted />
              ))}
            </View>
          )}
        </View>

        {/* Refurb */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Refurb</Text>
          <InputField label="Refurb Cost" value={inputs.refurbCost} onChangeText={set('refurbCost')} prefix="£" placeholder="0" />
          <InputField label="Contingency" value={inputs.refurbContingencyPct} onChangeText={set('refurbContingencyPct')} suffix="%" placeholder="10" />
        </View>

        {/* Finance */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Finance</Text>
          <InputField label="Interest Rate" value={inputs.interestRate} onChangeText={set('interestRate')} suffix="%" placeholder="5.5" />
          {inputs.strategy === 'brr' && (
            <InputField label="New Mortgage LTV (after refurb)" value={inputs.newMortgagePct} onChangeText={set('newMortgagePct')} suffix="%" placeholder="75" hint="LTV on the refinanced product" />
          )}
        </View>

        {/* Income */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Income</Text>
          {inputs.strategy === 'stl' ? (
            <>
              <InputField label="Nightly Rate" value={inputs.nightlyRate} onChangeText={set('nightlyRate')} prefix="£" placeholder="85" />
              <InputField label="Occupancy" value={inputs.occupancyPct} onChangeText={set('occupancyPct')} suffix="%" placeholder="70" hint="Average % of nights booked" />
            </>
          ) : (
            <InputField label="Monthly Rent" value={inputs.rentPerMonth} onChangeText={set('rentPerMonth')} prefix="£" placeholder="900" />
          )}
        </View>

        {/* OPEX */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Running Costs (OPEX)</Text>
          <InputField label="Service Charge / Ground Rent (annual)" value={inputs.serviceCharge} onChangeText={set('serviceCharge')} prefix="£" placeholder="0" />
          <InputField label="Buildings & Landlord Insurance (annual)" value={inputs.insurance} onChangeText={set('insurance')} prefix="£" placeholder="800" />
          <InputField label="Management Fee" value={inputs.mgmtFeePct} onChangeText={set('mgmtFeePct')} suffix="%" placeholder="10" hint="% of rent — set 0 if self-managing" />
          <InputField label="Maintenance Reserve" value={inputs.maintenancePct} onChangeText={set('maintenancePct')} suffix="%" placeholder="5" hint="% of rent set aside for repairs" />
          <InputField label="Void Allowance (months/yr)" value={inputs.voidMonths} onChangeText={set('voidMonths')} placeholder="0.5" hint="Average empty months per year" />
        </View>

        {/* 5yr growth */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5-Year Projection</Text>
          <InputField label="Annual Capital Growth %" value={inputs.capitalGrowthPct} onChangeText={set('capitalGrowthPct')} suffix="%" placeholder="3" hint="Conservative: 2–3%, optimistic: 4–5%" />
        </View>

        {/* Results */}
        {results ? (
          <View style={styles.results}>
            <Text style={[styles.resultsTitle, { color: stratColor }]}>Results</Text>

            <SectionDivider title="Costs Summary" />
            <ResultRow label="Deposit" value={fmtGbp(results.mortgageAmount > 0 ? parseFloat(inputs.purchasePrice.replace(/,/g,'') || '0') * parseFloat(inputs.depositPct || '0') / 100 : 0)} />
            <ResultRow label="Stamp Duty (SDLT)" value={fmtGbp(results.stampDuty)} />
            <ResultRow label="Total Purchase Costs" value={fmtGbp(results.totalPurchaseCosts)} />
            <ResultRow label="Total Capital Invested" value={fmtGbp(results.totalInvested)} highlight />

            <SectionDivider title="Mortgage" />
            <ResultRow label="Mortgage Amount" value={fmtGbp(results.mortgageAmount)} />
            <ResultRow label="Monthly Payment (IO)" value={fmtGbp(results.monthlyMortgage)} />

            {inputs.strategy === 'brr' && results.newMortgageAmount != null && (
              <>
                <SectionDivider title="BRR — Refinance" />
                <ResultRow label="New Mortgage (after refurb)" value={fmtGbp(results.newMortgageAmount)} />
                <ResultRow label="Capital Extracted" value={fmtGbp(results.valueExtracted ?? 0)} highlight={( results.valueExtracted ?? 0) > 0} negative={(results.valueExtracted ?? 0) < 0} />
                <ResultRow label="Capital Left In" value={fmtGbp(results.capitalLeftIn ?? 0)} highlight />
              </>
            )}

            <SectionDivider title="Cashflow" />
            <ResultRow label="Monthly Gross Income" value={fmtGbp(results.monthlyGrossIncome)} />
            <ResultRow label="Monthly Mortgage" value={fmtGbp(-results.monthlyMortgage)} negative />
            <ResultRow label="Monthly OPEX" value={fmtGbp(-results.monthlyOpex)} negative />
            <ResultRow label="Monthly Net Cashflow" value={fmtGbp(results.monthlyNetCashflow)} highlight={results.monthlyNetCashflow > 0} negative={results.monthlyNetCashflow < 0} />
            <ResultRow label="Annual Net Cashflow" value={fmtGbp(results.annualNetCashflow)} highlight={results.annualNetCashflow > 0} negative={results.annualNetCashflow < 0} />

            <SectionDivider title="Returns" />
            <ResultRow label="Gross Yield" value={fmtPct(results.grossYield)} />
            <ResultRow label="Net Yield" value={fmtPct(results.netYield)} highlight={results.netYield > 4} negative={results.netYield < 0} />
            <ResultRow label="Cash-on-Cash Return" value={fmtPct(results.cashOnCash)} highlight={results.cashOnCash > 6} negative={results.cashOnCash < 0} />

            {/* Stress test */}
            <TouchableOpacity style={styles.expandRow} onPress={() => setShowStress(v => !v)}>
              <Text style={styles.expandLabel}>Stress Test</Text>
              <Text style={styles.expandChevron}>{showStress ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showStress && (
              <View style={styles.stressBox}>
                <Text style={styles.stressNote}>Monthly cashflow under adverse conditions:</Text>
                <ResultRow label="Rent drops 10%" value={fmtGbp(results.stress.rent10pctDrop)} negative={results.stress.rent10pctDrop < 0} />
                <ResultRow label="Rates rise 2%" value={fmtGbp(results.stress.rates2pctRise)} negative={results.stress.rates2pctRise < 0} />
                <ResultRow label="4-week void" value={fmtGbp(results.stress.void4weeks)} negative={results.stress.void4weeks < 0} />
              </View>
            )}

            {/* 5yr projection */}
            <TouchableOpacity style={styles.expandRow} onPress={() => setShowProjection(v => !v)}>
              <Text style={styles.expandLabel}>5-Year Projection ({inputs.capitalGrowthPct}% growth/yr)</Text>
              <Text style={styles.expandChevron}>{showProjection ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showProjection && (
              <View style={styles.stressBox}>
                <ResultRow label="Estimated Value" value={fmtGbp(results.projection5yr.estimatedValue)} />
                <ResultRow label="Capital Growth" value={fmtGbp(results.projection5yr.capitalGrowth)} highlight />
                <ResultRow label="Cumulative Cashflow" value={fmtGbp(results.projection5yr.cumulativeCashflow)} highlight={results.projection5yr.cumulativeCashflow > 0} negative={results.projection5yr.cumulativeCashflow < 0} />
                <ResultRow label="Total 5yr Return" value={fmtGbp(results.projection5yr.totalReturn)} highlight />
              </View>
            )}

          </View>
        ) : (
          <View style={styles.emptyResults}>
            <Text style={styles.emptyText}>Enter a purchase price to see results</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.md },
  title: { color: colors.text, fontSize: font.sizes.xl, fontWeight: '700', marginBottom: 2 },
  subtitle: { color: colors.textSecondary, fontSize: font.sizes.sm, marginBottom: spacing.md },

  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabText: { color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: font.sizes.md, fontWeight: '700', marginBottom: spacing.sm },
  label: { color: colors.text, fontSize: font.sizes.md, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: font.sizes.xs, marginTop: 2 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  ownershipToggle: { flexDirection: 'row', gap: spacing.xs },
  ownerBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  ownerBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  ownerBtnText: { color: colors.textSecondary, fontSize: font.sizes.sm },
  ownerBtnTextActive: { color: colors.primary, fontWeight: '600' },
  taxNote: { color: colors.warning, fontSize: font.sizes.xs, marginTop: 2 },
  taxNoteGreen: { color: colors.positive, fontSize: font.sizes.xs, marginTop: 2 },

  sdltToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  sdltLabel: { color: colors.textSecondary, fontSize: font.sizes.sm },
  sdltChevron: { color: colors.textMuted, fontSize: font.sizes.sm },
  sdltBreakdown: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  sdltNote: { color: colors.textMuted, fontSize: font.sizes.xs, marginBottom: spacing.xs, fontStyle: 'italic' },

  results: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  resultsTitle: { fontSize: font.sizes.lg, fontWeight: '700', marginBottom: spacing.sm },

  expandRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  expandLabel: { color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: '600' },
  expandChevron: { color: colors.textMuted },
  stressBox: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.xs },
  stressNote: { color: colors.textMuted, fontSize: font.sizes.xs, marginBottom: spacing.xs, fontStyle: 'italic' },

  emptyResults: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.textMuted, fontSize: font.sizes.md },
});

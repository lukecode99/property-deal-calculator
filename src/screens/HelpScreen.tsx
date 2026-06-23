import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, font } from '../theme';

const TIPS = [
  { title: 'BTL (Buy-to-Let)', body: 'Standard rental. Buy with a mortgage, rent out long-term. Results show interest-only mortgage cashflow — most BTL mortgages are IO.' },
  { title: 'BRR (Buy, Refurb, Refinance)', body: 'Buy below market value, refurbish to increase value, refinance at the new value to extract your capital for the next deal. Enter the post-refurb value (GDV) and new LTV to see how much capital you can recycle.' },
  { title: 'STL / AirBnB', body: 'Short-term lets on Airbnb/VRBO. Enter your nightly rate and expected occupancy %. 70% is realistic in most markets. STL can yield more but has higher OPEX (cleaning, council tax, etc.).' },
  { title: 'Section 24 Tax', body: 'In your personal name, you can no longer deduct mortgage interest as an expense. You get a 20% tax credit instead. Higher-rate taxpayers (40%) pay roughly 20% extra tax on interest vs a limited company.' },
  { title: 'Ltd Company', body: 'Mortgage interest is fully deductible. You pay corporation tax (19–25%) on profits. Useful for growing portfolios. Speak to an accountant about extraction costs (salary + dividends).' },
  { title: 'Cash-on-Cash Return', body: 'Annual cashflow ÷ total cash invested. Measures the actual cash yield on your capital deployed. 6%+ is generally considered good for UK BTL.' },
  { title: 'SDLT (Stamp Duty)', body: 'Additional dwelling surcharge of 5% applies to all investment properties (increased from 3% in October 2024). The calculator applies this automatically across all bands.' },
];

export function HelpScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Guide</Text>
        <Text style={styles.subtitle}>How to use this calculator</Text>
        {TIPS.map(t => (
          <View key={t.title} style={styles.card}>
            <Text style={styles.tipTitle}>{t.title}</Text>
            <Text style={styles.tipBody}>{t.body}</Text>
          </View>
        ))}
        <Text style={styles.disclaimer}>
          This calculator is for illustrative purposes only. Always verify figures with a qualified mortgage broker, solicitor, and accountant before making investment decisions.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  title: { color: colors.text, fontSize: font.sizes.xl, fontWeight: '700', marginBottom: 2 },
  subtitle: { color: colors.textSecondary, fontSize: font.sizes.sm, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipTitle: { color: colors.primary, fontSize: font.sizes.md, fontWeight: '700', marginBottom: spacing.xs },
  tipBody: { color: colors.textSecondary, fontSize: font.sizes.sm, lineHeight: 20 },
  disclaimer: {
    color: colors.textMuted, fontSize: font.sizes.xs, marginTop: spacing.md,
    textAlign: 'center', lineHeight: 18,
  },
});

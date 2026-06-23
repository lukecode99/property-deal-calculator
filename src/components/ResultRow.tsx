import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, font, spacing } from '../theme';

interface Props {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
  indent?: boolean;
  muted?: boolean;
}

export function ResultRow({ label, value, highlight, negative, indent, muted }: Props) {
  return (
    <View style={[styles.row, indent && styles.indent]}>
      <Text style={[styles.label, muted && styles.muted]}>{label}</Text>
      <Text style={[
        styles.value,
        highlight && styles.highlight,
        negative && styles.negative,
        muted && styles.muted,
      ]}>{value}</Text>
    </View>
  );
}

export function SectionDivider({ title }: { title: string }) {
  return (
    <View style={styles.divider}>
      <Text style={styles.dividerText}>{title.toUpperCase()}</Text>
    </View>
  );
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtGbp(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}£${fmt(abs)}`;
}

export function fmtPct(n: number, decimals = 2): string {
  return `${fmt(n, decimals)}%`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  indent: { paddingLeft: spacing.md },
  label: { color: colors.textSecondary, fontSize: font.sizes.sm, flex: 1 },
  value: { color: colors.text, fontSize: font.sizes.sm, fontWeight: '600', textAlign: 'right' },
  highlight: { color: colors.primary, fontSize: font.sizes.md },
  negative: { color: colors.negative },
  muted: { color: colors.textMuted, fontSize: font.sizes.xs },
  divider: {
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: spacing.sm,
    marginBottom: 2,
    borderRadius: 4,
  },
  dividerText: { color: colors.textMuted, fontSize: font.sizes.xs, fontWeight: '700', letterSpacing: 0.8 },
});

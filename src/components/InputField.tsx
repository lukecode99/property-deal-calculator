import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, font } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  keyboardType?: 'numeric' | 'decimal-pad' | 'default' | 'url';
  hint?: string;
  min?: number;
  max?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

// Group the integer part with commas, preserving any decimal part as typed
function fmtThousands(raw: string): string {
  const dot = raw.indexOf('.');
  const int = dot === -1 ? raw : raw.slice(0, dot);
  const rest = dot === -1 ? '' : raw.slice(dot);
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
}

export function InputField({ label, value, onChangeText, prefix, suffix, placeholder, keyboardType = 'decimal-pad', hint, min, max, autoCapitalize }: Props) {
  const isNumeric = keyboardType === 'numeric' || keyboardType === 'decimal-pad';
  const isMoney = prefix === '£';

  // £ fields display with thousands separators; state stays comma-free so every
  // parseFloat/n() downstream keeps working
  const display = isMoney && value ? fmtThousands(value.replace(/,/g, '')) : value;

  const num = parseFloat(value.replace(/,/g, ''));
  const outOfRange = value !== '' && !isNaN(num) &&
    ((min != null && num < min) || (max != null && num > max));

  const handleChange = (v: string) => {
    onChangeText(isNumeric ? v.replace(/[^0-9.]/g, '') : v);
  };

  const handleEndEditing = () => {
    if (!isNumeric || value === '' || isNaN(num)) return;
    if (max != null && num > max) onChangeText(String(max));
    else if (min != null && num < min) onChangeText(String(min));
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        {prefix ? <View style={styles.affix}><Text style={styles.affixText}>{prefix}</Text></View> : null}
        <TextInput
          style={[styles.input, isNumeric && styles.inputNumeric, prefix && styles.inputWithPrefix, suffix && styles.inputWithSuffix, outOfRange && styles.inputError]}
          value={display}
          onChangeText={handleChange}
          onEndEditing={handleEndEditing}
          keyboardType={keyboardType}
          placeholder={placeholder ?? '0'}
          placeholderTextColor={colors.textMuted}
          autoCapitalize={autoCapitalize}
          returnKeyType="done"
        />
        {suffix ? <View style={styles.affixRight}><Text style={styles.affixText}>{suffix}</Text></View> : null}
      </View>
      {outOfRange ? (
        <Text style={styles.errorText}>
          {min != null && max != null ? `Enter a value between ${min} and ${max}`
            : max != null ? `Maximum ${max}` : `Minimum ${min}`} — will be clamped
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm, minWidth: 0 },
  label: { color: colors.textSecondary, fontSize: font.sizes.sm, marginBottom: 4 },
  hint: { color: colors.textMuted, fontSize: font.sizes.xs, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: colors.inputBg,
    color: colors.inputText,
    fontSize: font.sizes.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputNumeric: { textAlign: 'right' },
  inputError: { borderColor: colors.negative },
  errorText: { color: colors.negative, fontSize: font.sizes.xs, marginTop: 4 },
  inputWithPrefix: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  inputWithSuffix: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  affix: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRightWidth: 0,
    borderTopLeftRadius: radius.sm,
    borderBottomLeftRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  affixRight: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 0,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  affixText: { color: colors.textSecondary, fontSize: font.sizes.md },
});

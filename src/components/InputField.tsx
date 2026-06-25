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
}

export function InputField({ label, value, onChangeText, prefix, suffix, placeholder, keyboardType = 'decimal-pad', hint }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        {prefix ? <View style={styles.affix}><Text style={styles.affixText}>{prefix}</Text></View> : null}
        <TextInput
          style={[styles.input, prefix && styles.inputWithPrefix, suffix && styles.inputWithSuffix]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder ?? '0'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
        />
        {suffix ? <View style={styles.affixRight}><Text style={styles.affixText}>{suffix}</Text></View> : null}
      </View>
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

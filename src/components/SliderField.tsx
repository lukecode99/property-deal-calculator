import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, font, spacing, radius } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (val: string) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hint?: string;
  note?: string;       // source explanation shown below range labels
  source?: string;     // e.g. "BoE + 1.5%", "Land Registry"
  decimals?: number;
}

export function SliderField({ label, value, onChangeText, min, max, step, suffix, hint, note, source, decimals = 1 }: Props) {
  const num = parseFloat(value) || 0;
  const clamped = Math.min(max, Math.max(min, num));

  function adjust(delta: number) {
    const next = Math.round((clamped + delta) * 1000) / 1000;
    onChangeText(String(Math.min(max, Math.max(min, next)).toFixed(decimals)));
  }

  function onSlide(v: number) {
    onChangeText(v.toFixed(decimals));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueRow}>
          {source && <Text style={styles.badge}>{source}</Text>}
          <TouchableOpacity style={styles.btn} onPress={() => adjust(-step)}>
            <Text style={styles.btnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.value}>{clamped.toFixed(decimals)}{suffix}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => adjust(step)}>
            <Text style={styles.btnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={clamped}
        onValueChange={onSlide}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.primary}
      />
      <View style={styles.rangeLabels}>
        <Text style={styles.rangeText}>{min}{suffix}</Text>
        <Text style={styles.rangeText}>{max}{suffix}</Text>
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    color: colors.textSecondary,
    fontSize: font.sizes.sm,
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    color: colors.primary,
    fontSize: 10,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  btn: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 18,
  },
  value: {
    color: colors.text,
    fontSize: font.sizes.md,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'center',
  },
  slider: {
    width: '100%',
    height: 32,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  rangeText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.sizes.xs,
    marginTop: 2,
  },
  note: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 3,
    fontStyle: 'italic',
  },
});

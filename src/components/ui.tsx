import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors as c } from '../theme';
export function Button({
  title,
  icon,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      {icon && <Feather name={icon} size={18} color={secondary ? c.ink : c.white} />}
      <Text style={[s.buttonText, secondary && { color: c.ink }]}>{title}</Text>
    </Pressable>
  );
}
export function Pill({ children, warm = false }: { children: ReactNode; warm?: boolean }) {
  return (
    <View style={[s.pill, warm && { backgroundColor: '#FAEEDB' }]}>
      <Text style={[s.pillText, warm && { color: c.orange }]}>{children}</Text>
    </View>
  );
}
export function Progress({ value, light = false }: { value: number; light?: boolean }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={[s.track, light && { backgroundColor: '#40604B' }]}
    >
      <View
        style={[
          s.fill,
          {
            width: `${Math.max(0, Math.min(100, value * 100))}%`,
            backgroundColor: light ? c.lime : c.ink,
          },
        ]}
      />
    </View>
  );
}
export function Avatar({
  name,
  index = 0,
  size = 34,
}: {
  name: string;
  index?: number;
  size?: number;
}) {
  return (
    <View
      style={[
        s.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: ['#DDE9CB', '#F2DCC2', '#DDDCEE', '#EACDD1'][index % 4],
        },
      ]}
    >
      <Text style={{ color: c.ink, fontWeight: '700', fontSize: size * 0.35 }}>
        {name.substring(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export const ui = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -1.2, color: c.ink },
  heading: { fontSize: 21, fontWeight: '700', letterSpacing: -0.6, color: c.ink },
  body: { color: c.muted, fontSize: 14, lineHeight: 22 },
  label: { fontSize: 11, fontWeight: '700', color: c.muted, letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderWidth: 1,
    padding: 16,
    borderRadius: 14,
    color: c.ink,
    fontSize: 16,
  },
});
const s = StyleSheet.create({
  button: {
    backgroundColor: c.ink,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    flexDirection: 'row',
    gap: 10,
  },
  secondary: { backgroundColor: c.soft },
  buttonText: { color: c.white, fontSize: 15, fontWeight: '700' },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EDF4E1',
  },
  pillText: { color: c.ink, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  track: { height: 6, borderRadius: 4, backgroundColor: '#EDF0E7', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 4 },
  avatar: { justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: c.paper },
  card: {
    backgroundColor: c.white,
    padding: 20,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: c.border,
    gap: 16,
  },
});

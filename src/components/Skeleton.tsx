import React from 'react';
import { View, type DimensionValue } from 'react-native';
import { Card } from './ui';
import { colors } from '../theme';

export function Skeleton({
  width = '100%',
  height = 16,
  dark = false,
}: {
  width?: DimensionValue;
  height?: number;
  dark?: boolean;
}) {
  return (
    <View
      accessible={false}
      style={{ width, height, borderRadius: 8, backgroundColor: dark ? '#40604B' : colors.border }}
    />
  );
}

export function RoundSkeletons({ label = 'Loading rounds' }: { label?: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ gap: 16 }}
    >
      {[0, 1, 2].map((key) => (
        <Card key={key}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton width="55%" height={24} />
            <Skeleton width={65} height={24} />
          </View>
          <Skeleton width="40%" />
          <Skeleton height={8} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton width={90} />
            <Skeleton width={70} />
          </View>
        </Card>
      ))}
    </View>
  );
}

export function SummarySkeleton({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <Card>
        {[0, 1, 2].map((key) => (
          <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton width="55%" />
            <Skeleton width={40} />
          </View>
        ))}
      </Card>
    </View>
  );
}

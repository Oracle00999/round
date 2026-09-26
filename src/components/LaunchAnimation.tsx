import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { colors as c } from '../theme';

/** Mount once per app launch; wallet returns and ordinary resumes do not replay it. */
export function LaunchAnimation({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    const fallback = setTimeout(() => setVisible(false), 2300);
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (disposed) return;
        if (reduced) {
          setVisible(false);
          return;
        }
        animation = Animated.sequence([
          Animated.timing(reveal, { toValue: 1, duration: 650, useNativeDriver: true }),
          Animated.delay(950),
          Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]);
        animation.start(({ finished }) => {
          if (finished && !disposed) setVisible(false);
        });
      })
      .catch(() => setVisible(false));
    return () => {
      disposed = true;
      clearTimeout(fallback);
      animation?.stop();
    };
  }, [opacity, reveal]);
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={visible}
        importantForAccessibility={visible ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {visible && (
        <Animated.View style={[styles.cover, { opacity }]} accessibilityLabel="ROUND is opening">
          <Animated.View
            style={{
              alignItems: 'center',
              opacity: reveal,
              transform: [
                { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            }}
          >
            <View style={styles.mark}>
              <View style={styles.center} />
            </View>
            <Text style={styles.name}>
              round<Text style={{ color: c.lime }}>.</Text>
            </Text>
            <Text style={styles.tagline}>Your goal. Your people. Your savings.</Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: c.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.lime },
  name: { fontSize: 54, fontWeight: '800', letterSpacing: -3, color: c.ink, marginTop: 15 },
  tagline: { fontSize: 15, color: c.muted, marginTop: 12 },
});

import { NETWORK_DESCRIPTION } from '../chain/network';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { Button } from './ui';
import { colors as c } from '../theme';

export const INTRO_KEY = 'round:introduction:v1';
const pages = [
  {
    tag: 'SAVE TOGETHER. SECURED ON SOLANA.',
    title: 'Big goals.\nSmall steps.\nYour people.',
    body: 'Create a savings ROUND with friends. Your contributions are held on Solana, with every deposit approved by you. Choose a goal and build the habit together.',
    icon: 'users',
    caption: 'A shared goal. Your own savings.',
    satellites: ['target', 'user-plus', 'heart'],
  },
  {
    tag: 'FIND YOUR RHYTHM',
    title: 'A little today.\nCloser tomorrow.',
    body: 'Agree on an amount and a schedule. Approve each contribution in your wallet and keep track of your progress.',
    icon: 'calendar',
    caption: 'One contribution at a time.',
    satellites: ['clock', 'check', 'trending-up'],
  },
  {
    tag: 'YOURS, ALL THE WAY',
    title: 'Your savings.\nYour finish line.',
    body: 'Your deposits stay locked until the ROUND ends. Then withdraw everything you saved, plus any SKR lock—even if you missed a contribution.',
    icon: 'shield',
    caption: 'No penalties for missed payments.',
    satellites: ['lock', 'check-circle', 'unlock'],
  },
] as const;

export function Onboarding({ children }: { children: (replay: () => void) => React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(INTRO_KEY)
      .then((value) => {
        if (active) setFinished(value === 'done');
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const complete = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await AsyncStorage.setItem(INTRO_KEY, 'done');
      setFinished(true);
      setReplaying(false);
    } catch {
      setError(
        'We couldn’t save your preference. Try again, or continue for now. The introduction may appear next time.',
      );
    } finally {
      setSaving(false);
    }
  };
  const page = pages[step];
  const walkthrough = (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <View style={s.shell}>
          {!ready ? (
            <ActivityIndicator
              accessibilityLabel="Opening ROUND"
              color={c.ink}
              style={{ flex: 1 }}
            />
          ) : (
            <>
              <View style={s.top}>
                <View style={s.brand}>
                  <View style={s.mark}>
                    <View style={s.hole} />
                  </View>
                  <Text style={s.wordmark}>
                    round<Text style={{ color: '#9AB75F' }}>.</Text>
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Skip introduction"
                  disabled={saving}
                  hitSlop={12}
                  onPress={complete}
                >
                  <Text style={s.skip}>Skip</Text>
                </Pressable>
              </View>
              <ScrollView
                key={step}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.content}
              >
                <View accessible accessibilityLabel={page.caption} style={s.art}>
                  <View style={s.orbit} />
                  <View style={s.orbitInner} />
                  <View style={s.center}>
                    <Feather name={page.icon} size={60} color={c.lime} />
                  </View>
                  {page.satellites.map((icon, i) => (
                    <View
                      key={icon}
                      style={[s.satellite, i === 0 ? s.satOne : i === 1 ? s.satTwo : s.satThree]}
                    >
                      <Feather name={icon} size={25} color={c.ink} />
                    </View>
                  ))}
                  <View style={s.caption}>
                    <Feather name="check" size={14} color={c.ink} />
                    <Text style={s.captionText}>{page.caption}</Text>
                  </View>
                </View>
                <Text style={s.tag}>{page.tag}</Text>
                <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.title}>
                  {page.title}
                </Text>
                <Text style={s.body}>{page.body}</Text>
                {step === 2 && (
                  <View style={s.network}>
                    <Feather name="info" size={17} color={c.ink} />
                    <Text style={s.networkText}>{NETWORK_DESCRIPTION}</Text>
                  </View>
                )}
              </ScrollView>
              <View style={s.bottom}>
                <View style={s.progress}>
                  <View style={s.dots}>
                    {pages.map((_, i) => (
                      <View key={i} style={[s.dot, i === step && s.activeDot]} />
                    ))}
                  </View>
                  <Text style={s.count}>
                    {step + 1} / {pages.length}
                  </Text>
                </View>
                {error ? (
                  <>
                    <Text accessibilityRole="alert" style={s.error}>
                      {error}
                    </Text>
                    <Button
                      secondary
                      title="Continue for now"
                      onPress={() => {
                        setFinished(true);
                        setReplaying(false);
                      }}
                    />
                  </>
                ) : null}
                <Button
                  title={
                    saving
                      ? 'Getting ready…'
                      : step === pages.length - 1
                        ? 'Let’s get started'
                        : 'Next'
                  }
                  icon="arrow-right"
                  disabled={saving}
                  onPress={step === pages.length - 1 ? complete : () => setStep(step + 1)}
                />
                {step > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setStep(step - 1)}
                    style={s.back}
                  >
                    <Text style={s.skip}>Back</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
  return finished ? (
    <>
      {children(() => {
        setStep(0);
        setError('');
        setReplaying(true);
      })}
      <Modal visible={replaying} animationType="slide" onRequestClose={() => setReplaying(false)}>
        {walkthrough}
      </Modal>
    </>
  ) : (
    walkthrough
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.paper },
  shell: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: c.paper },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingVertical: 20,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.lime },
  wordmark: { fontSize: 29, fontWeight: '800', letterSpacing: -1.3, color: c.ink },
  skip: { fontSize: 14, fontWeight: '600', color: c.muted },
  content: { paddingHorizontal: 28, paddingBottom: 20 },
  art: { height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  orbit: {
    width: 222,
    height: 222,
    borderRadius: 111,
    borderWidth: 1,
    borderColor: c.border,
    position: 'absolute',
  },
  orbitInner: {
    width: 175,
    height: 175,
    borderRadius: 88,
    borderWidth: 1,
    borderColor: '#DCE5CE',
    position: 'absolute',
  },
  center: {
    width: 124,
    height: 124,
    borderRadius: 40,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-7deg' }],
  },
  satellite: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.lime,
    borderWidth: 4,
    borderColor: c.paper,
  },
  satOne: { top: 16, left: '15%', transform: [{ rotate: '-10deg' }] },
  satTwo: { top: 67, right: '6%', backgroundColor: '#E3EAD9', transform: [{ rotate: '10deg' }] },
  satThree: {
    bottom: 46,
    left: '8%',
    backgroundColor: '#F2E5CC',
    transform: [{ rotate: '-8deg' }],
  },
  caption: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  captionText: { fontSize: 11, color: c.ink, fontWeight: '600' },
  tag: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8, color: c.muted, marginBottom: 14 },
  title: {
    fontSize: 39,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -1.8,
    color: c.ink,
    marginBottom: 18,
  },
  body: { fontSize: 16, lineHeight: 25, color: c.muted },
  network: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: c.soft,
    padding: 14,
    borderRadius: 16,
    marginTop: 18,
  },
  networkText: { flex: 1, color: c.ink, fontSize: 12, lineHeight: 18 },
  bottom: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 18, gap: 12 },
  progress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: '#D6DDCF' },
  activeDot: { width: 26, backgroundColor: c.ink },
  count: { color: c.muted, fontSize: 12 },
  back: { alignItems: 'center', padding: 7 },
  error: { color: '#A13A2C', fontSize: 13, lineHeight: 19 },
});

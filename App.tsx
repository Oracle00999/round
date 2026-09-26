import {
  NETWORK,
  NETWORK_LABEL,
  NETWORK_DESCRIPTION,
  explorerTransaction,
} from './src/chain/network';
import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { LaunchAnimation } from './src/components/LaunchAnimation';
import { Onboarding } from './src/components/Onboarding';
import { Avatar, Button, Card, Pill, Progress, ui } from './src/components/ui';
import { colors as c } from './src/theme';
import {
  CreateInput,
  endsAt,
  isComplete,
  hasWithdrawableFunds,
  money,
  nowSeconds,
  parseAmount,
  periodIndex,
  Round,
  roundPhase,
  target,
  validateRules,
} from './src/domain/round';
import { userMessage, UserFacingError } from './src/services/errors';
import { connectWallet } from './src/services/wallet';
import { scheduleReminders, initializeNotifications } from './src/services/reminders';
import { useDevnet } from './src/hooks/useDevnet';
import { shortAddress } from './src/chain/client';
import { invitationLink, parseInvitation } from './src/domain/invites';

type Tab = 'home' | 'rounds' | 'history' | 'profile';
const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dateTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const countdown = (seconds: number) => {
  const remaining = Math.max(0, Math.floor(seconds));
  if (remaining >= 86400)
    return `${Math.floor(remaining / 86400)}d ${Math.floor((remaining % 86400) / 3600)}h`;
  if (remaining >= 3600)
    return `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`;
  return `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
};
const cadence = (r: Round) =>
  r.periodSeconds === 604800
    ? 'week'
    : r.periodSeconds === 86400
      ? 'day'
      : r.periodSeconds === 30
        ? '30 seconds'
        : r.periodSeconds === 180
          ? '3 minutes'
          : 'minute';

function goalIcon(name: string): React.ComponentProps<typeof Feather>['name'] {
  if (/laptop|computer|tech/i.test(name)) return 'monitor';
  if (/trip|travel|holiday/i.test(name)) return 'compass';
  if (/home|rent|house/i.test(name)) return 'home';
  if (/school|course|education/i.test(name)) return 'book-open';
  return 'target';
}

export default function App() {
  return (
    <LaunchAnimation>
      <Onboarding>{(replay) => <RoundApp onShowIntro={replay} />}</Onboarding>
    </LaunchAnimation>
  );
}

function RoundApp({ onShowIntro }: { onShowIntro: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [quickTest, setQuickTest] = useState(false);
  const [invite, setInvite] = useState<Round | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [wallet, setWallet] = useState<string | null>(null);
  const network = useDevnet(wallet, true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    void initializeNotifications().catch(() => {});
  }, []);
  const [clock, setClock] = useState(nowSeconds());
  const rounds = network.rounds;
  const viewer = wallet ?? '';
  const working = busy || network.busy;
  const now = clock + network.offset;
  const detailNow = now;
  const active = rounds.find((r) => r.id === selected);

  useEffect(() => {
    const timer = setInterval(() => setClock(nowSeconds()), 1000);
    const open = ({ url }: { url: string }) => {
      try {
        parseInvitation(url);
        setJoinId(url);
        setJoinOpen(true);
      } catch {
        /* Ignore unrelated links. */
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) open({ url });
    });
    const listener = Linking.addEventListener('url', open);
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  const showError = (error: unknown) =>
    setNotice({
      title: 'Let’s check that',
      body: userMessage(error),
    });
  const mutate = async (r: Round, action: 'contribute' | 'withdraw' | 'join') => {
    try {
      const result = await network.act(r.id, action);
      setNotice({
        title: 'Confirmed on Solana',
        body:
          (action === 'withdraw'
            ? 'Your savings and commitment lock have been returned to your wallet.'
            : action === 'join'
              ? 'You joined the ROUND. Invite your people before it starts.'
              : 'Your contribution is confirmed and locked until the agreed end time.') +
          (result.notificationWarning ? `\n\n${result.notificationWarning}` : ''),
      });
    } catch (error) {
      showError(error);
    }
  };
  const mine = rounds.filter((r) => r.members.some((m) => m.wallet === viewer));
  const balance = mine.reduce((sum, r) => {
    const m = r.members.find((m) => m.wallet === viewer)!;
    return sum + (m.withdrawn ? 0 : m.deposited);
  }, 0);
  const activeCount = mine.filter((r) => roundPhase(r, now) !== 'Ended').length;
  const due = mine.find(
    (r) =>
      roundPhase(r, now) === 'Active' &&
      !r.members.find((m) => m.wallet === viewer)!.paidPeriods.includes(periodIndex(r, now)),
  );
  const finished = mine.filter((r) => roundPhase(r, now) === 'Ended');

  const header = (
    <View style={s.header}>
      <Pressable
        onPress={() => {
          setSelected(null);
          setTab('home');
        }}
        accessibilityLabel="ROUND home"
        style={s.brand}
      >
        <View style={s.logo}>
          <View style={s.logoHole} />
        </View>
        <Text style={s.wordmark}>
          round<Text style={{ color: '#9AB75F' }}>.</Text>
        </Text>
      </Pressable>
      <View style={ui.row}>
        <View style={s.networkDot} />
        <Text style={s.network}>{NETWORK_LABEL.toUpperCase()}</Text>
        <Pressable
          accessibilityLabel="Open profile"
          onPress={() => {
            setSelected(null);
            setTab('profile');
          }}
        >
          <Avatar name="You" size={39} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <View style={s.shell}>
          {header}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!wallet && (
              <Card style={{ padding: 14, gap: 8 }}>
                <Text style={s.small}>Connect your wallet to start saving together.</Text>
                <Button
                  title={busy ? 'Opening wallet…' : 'Connect wallet'}
                  disabled={busy}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      setWallet(await connectWallet());
                    } catch (e) {
                      showError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </Card>
            )}
            <Text style={s.small}>{NETWORK_DESCRIPTION}</Text>
            {wallet && (
              <Card style={{ backgroundColor: c.soft }}>
                <View style={ui.row}>
                  <Pill>
                    {network.error
                      ? 'CONNECTION NEEDS ATTENTION'
                      : network.balances
                        ? 'CONNECTED'
                        : 'CONNECTING…'}
                  </Pill>
                  <Pressable disabled={working} onPress={() => network.refresh().catch(showError)}>
                    <Feather name="refresh-cw" size={18} color={c.ink} />
                  </Pressable>
                </View>
                {network.status ? <Text style={ui.body}>{network.status}</Text> : null}
                {network.error ? (
                  <Text accessibilityRole="alert" style={ui.body}>
                    {network.error}
                  </Text>
                ) : null}
                {network.pending && (
                  <>
                    <Text style={ui.body}>
                      A signed transaction is awaiting confirmation. Check its status before making
                      another payment.
                    </Text>
                    <Button
                      secondary
                      title="Check transaction status"
                      disabled={working}
                      onPress={async () => {
                        try {
                          const state = await network.reconcile();
                          setNotice({
                            title:
                              state === 'confirmed'
                                ? 'Transaction confirmed'
                                : 'Transaction status',
                            body:
                              state === 'pending'
                                ? 'Still awaiting confirmation. Your payment will not be submitted again.'
                                : state === 'failed' || state === 'expired'
                                  ? 'The transaction did not complete. Refresh and try again when ready.'
                                  : 'Your confirmed balances have been refreshed.',
                          });
                        } catch (e) {
                          showError(e);
                        }
                      }}
                    />
                  </>
                )}
                {(network.lastSignature || network.pending) && (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        explorerTransaction(network.pending?.signature ?? network.lastSignature!),
                      ).catch(showError)
                    }
                  >
                    <View style={ui.row}>
                      <Text style={s.link}>View transaction</Text>
                      <Feather name="external-link" size={16} color={c.ink} />
                    </View>
                  </Pressable>
                )}
              </Card>
            )}
            {active ? (
              <>
                <Pressable onPress={() => setSelected(null)} style={s.back}>
                  <Feather name="arrow-left" size={18} color={c.ink} />
                  <Text style={s.link}>Your rounds</Text>
                </Pressable>
                <View style={ui.row}>
                  <View style={[s.roundIcon, { backgroundColor: active.color }]}>
                    <Feather name={goalIcon(active.name)} size={28} color={c.ink} />
                  </View>
                  <Pill warm={roundPhase(active, detailNow) === 'Upcoming'}>
                    {roundPhase(active, detailNow).toUpperCase()}
                  </Pill>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={ui.title}>{active.name}</Text>
                  <Text style={ui.body}>
                    {money(active.amount)} USDC every {cadence(active)} · {active.periods}{' '}
                    contributions
                  </Text>
                </View>
                <SavingsDetail
                  round={active}
                  now={detailNow}
                  viewer={viewer}
                  disabled={working || !network.canTransact}
                  onAction={(action) => mutate(active, action)}
                />
                <View style={ui.row}>
                  <Text style={ui.heading}>In this together</Text>
                  <Text style={ui.body}>
                    {active.members.length}/{active.maxMembers} members
                  </Text>
                </View>
                <Card>
                  {active.members.map((m, i) => (
                    <View key={m.wallet} style={{ gap: 10 }}>
                      <View style={ui.row}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Avatar name={m.name} index={i} />
                          <View>
                            <Text style={s.memberName}>{m.name}</Text>
                            <Text style={s.small}>
                              {roundPhase(active, detailNow) === 'Ended'
                                ? isComplete(active, m)
                                  ? 'Completed'
                                  : 'Incomplete'
                                : `${m.paidPeriods.length} of ${active.periods} contributions`}
                            </Text>
                          </View>
                        </View>
                        <Text style={s.memberAmount}>
                          {money(m.deposited)}{' '}
                          <Text style={{ color: c.muted }}>/ {money(target(active))}</Text>
                        </Text>
                      </View>
                      <Progress value={m.deposited / target(active)} />
                    </View>
                  ))}
                </Card>
                <Text style={ui.heading}>The agreement</Text>
                <Card>
                  <Rule label="Starts" value={dateTime(active.startsAt)} />
                  <Rule label="Savings unlock" value={dateTime(endsAt(active))} />
                  <Rule label="Your goal" value={`${money(target(active))} USDC`} />
                  <Rule
                    label="SKR commitment lock"
                    value={active.bond ? `${money(active.bond)} SKR` : 'Not required'}
                  />
                  <Text style={ui.body}>
                    Each payment belongs to its member. Missed contributions never reduce your
                    refund. Any SKR lock is returned in full. No early withdrawals or catch-up
                    payments.
                  </Text>
                </Card>
                <Button
                  secondary
                  title="Invite your people"
                  icon="user-plus"
                  onPress={() => setInvite(active)}
                />
                <Button
                  secondary
                  title="Enable reminders"
                  icon="bell"
                  onPress={async () => {
                    try {
                      const count = await scheduleReminders(active);
                      setNotice({
                        title: 'Reminders are on',
                        body: `${count} upcoming reminders scheduled on this device.`,
                      });
                    } catch (e) {
                      showError(e);
                    }
                  }}
                />
              </>
            ) : tab === 'home' ? (
              <>
                <Button secondary icon="book-open" title="How ROUND works" onPress={onShowIntro} />
                <View style={{ gap: 6 }}>
                  <Text style={s.eyebrow}>A LITTLE TODAY. A LOT TOMORROW.</Text>
                  <Text style={s.greeting}>Good things take a ROUND.</Text>
                  <Text style={ui.body}>Your goals. Your people. A little more consistent.</Text>
                </View>
                <View style={s.balanceCard}>
                  <View style={ui.row}>
                    <Text style={s.balanceLabel}>YOUR SAVINGS</Text>
                    <View style={s.lockTag}>
                      <Feather name="lock" size={11} color={c.lime} />
                      <Text style={{ color: c.lime, fontSize: 10, fontWeight: '600' }}>
                        YOURS, ALWAYS
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                    <Text style={s.balance}>{network.balances ? money(balance) : '—'}</Text>
                    <Text style={s.currency}>USDC</Text>
                  </View>
                  <Text style={s.balanceHint}>Small steps. Real progress.</Text>
                  <View style={s.balanceDivider} />
                  <View style={ui.row}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={s.limeDot} />
                      <Text style={s.balanceFoot}>{activeCount} ongoing rounds</Text>
                    </View>
                    <Text style={s.balanceFoot}>{mine.length} shared goals</Text>
                  </View>
                  <View pointerEvents="none" style={s.orbitOne} />
                  <View pointerEvents="none" style={s.orbitTwo} />
                </View>
                <Pressable style={s.communityCard} onPress={() => setJoinOpen(true)}>
                  <View style={s.communityArt}>
                    <View style={s.miniOrbit} />
                    <Feather name="users" size={32} color={c.ink} />
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={s.memberName}>Better with your people.</Text>
                    <Text style={s.small}>
                      Got an invite? Join a ROUND and build the habit together.
                    </Text>
                  </View>
                  <Feather name="arrow-right" size={20} color={c.ink} />
                </Pressable>
                {due && (
                  <Pressable onPress={() => setSelected(due.id)} style={s.dueCard}>
                    <View style={s.dueIcon}>
                      <Feather name="clock" size={20} color={c.ink} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.dueTitle}>Keep your rhythm going</Text>
                      <Text style={s.small}>
                        {money(due.amount)} USDC · {due.name}
                      </Text>
                    </View>
                    <Feather name="arrow-up-right" size={20} color={c.ink} />
                  </Pressable>
                )}
                <View style={ui.row}>
                  <Text style={ui.heading}>
                    Your rounds <Text style={s.count}>{mine.length}</Text>
                  </Text>
                  <Pressable
                    onPress={() => (wallet ? setCreating(true) : setTab('profile'))}
                    hitSlop={10}
                  >
                    <Text style={s.link}>+ Create new</Text>
                  </Pressable>
                </View>
                {mine.length === 0 && (
                  <Card>
                    <Text style={ui.heading}>Your next goal starts here.</Text>
                    <Text style={ui.body}>
                      Create a ROUND or join a friend’s invitation. Your confirmed savings will
                      appear here.
                    </Text>
                    <Button
                      title="Start a ROUND"
                      disabled={working || !network.canTransact}
                      onPress={() => setCreating(true)}
                    />
                  </Card>
                )}
                {mine
                  .filter((r) => roundPhase(r, now) !== 'Ended')
                  .map((r) => (
                    <RoundCard
                      key={r.id}
                      round={r}
                      now={now}
                      viewer={viewer}
                      onPress={() => setSelected(r.id)}
                    />
                  ))}
                <View style={s.footerNote}>
                  <Feather name="shield" size={13} color={c.muted} />
                  <Text style={s.small}>No treasurer. No penalties. Just progress.</Text>
                </View>
              </>
            ) : tab === 'rounds' ? (
              <>
                <View style={ui.row}>
                  <View>
                    <Text style={s.eyebrow}>MAKE ROOM FOR YOUR GOALS</Text>
                    <Text style={ui.title}>Your rounds</Text>
                  </View>
                  <Pressable onPress={() => setJoinOpen(true)}>
                    <Feather name="link" size={22} color={c.ink} />
                  </Pressable>
                </View>
                <Button title="+ Start a new ROUND" onPress={() => setCreating(true)} />
                {mine.map((r) => (
                  <RoundCard
                    key={r.id}
                    round={r}
                    now={now}
                    viewer={viewer}
                    onPress={() => setSelected(r.id)}
                  />
                ))}
              </>
            ) : tab === 'history' ? (
              <>
                <Text style={s.eyebrow}>EVERY STEP COUNTS</Text>
                <Text style={ui.title}>Look how far you’ve come.</Text>
                <Text style={ui.body}>
                  An honest record of your savings journey. Incomplete rounds are part of the story,
                  too.
                </Text>
                <Card>
                  <Rule label="Rounds finished" value={String(finished.length)} />
                  <Rule
                    label="Completed"
                    value={String(
                      finished.filter((r) =>
                        isComplete(
                          r,
                          r.members.find((m) => m.wallet === viewer)!,
                        ),
                      ).length,
                    )}
                  />
                  <Rule
                    label="Incomplete"
                    value={String(
                      finished.filter(
                        (r) =>
                          !isComplete(
                            r,
                            r.members.find((m) => m.wallet === viewer)!,
                          ),
                      ).length,
                    )}
                  />
                </Card>
                {finished.length ? (
                  finished.map((r) => (
                    <RoundCard
                      key={r.id}
                      round={r}
                      now={now}
                      viewer={viewer}
                      onPress={() => setSelected(r.id)}
                    />
                  ))
                ) : (
                  <Text style={ui.body}>Your first chapter is still in progress.</Text>
                )}
              </>
            ) : (
              <>
                <Text style={s.eyebrow}>YOUR OWN PACE. YOUR OWN PROGRESS.</Text>
                <Text style={ui.title}>Your corner</Text>
                <Card>
                  <View style={ui.row}>
                    <Avatar name="You" size={60} />
                    <Pill>{NETWORK_LABEL.toUpperCase()} WALLET</Pill>
                  </View>
                  <Text style={ui.heading}>Welcome, saver.</Text>
                  <Text style={ui.body}>
                    Connect your wallet to save with your group. Every contribution requires your
                    approval.
                  </Text>
                  <Button
                    title={
                      busy
                        ? 'Opening wallet…'
                        : wallet
                          ? 'Wallet connected'
                          : 'Connect Seeker wallet'
                    }
                    disabled={working || !!wallet}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        setWallet(await connectWallet());
                      } catch (e) {
                        showError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  {wallet && (
                    <>
                      <Text selectable style={s.small}>
                        {wallet}
                      </Text>
                      <Text style={ui.body}>
                        {network.configured
                          ? `Connected as ${shortAddress(wallet)}.`
                          : 'ROUND cannot connect right now. Please update the app and try again.'}
                      </Text>
                      {network.balances && (
                        <>
                          <Rule label="Available USDC" value={money(network.balances.savings)} />
                          <Rule label="Available SKR" value={money(network.balances.bond)} />
                          <Rule label="SOL for fees" value={network.balances.sol.toFixed(4)} />
                        </>
                      )}
                      <Button
                        secondary
                        title="Disconnect wallet"
                        disabled={working}
                        onPress={() => {
                          setWallet(null);
                          setSelected(null);
                        }}
                      />
                    </>
                  )}
                </Card>
                <Card style={{ backgroundColor: c.soft }}>
                  <View style={ui.row}>
                    <Feather name="fast-forward" size={24} color={c.ink} />
                    <Text style={ui.heading}>A shorter ROUND</Text>
                  </View>
                  <Text style={ui.body}>
                    Start in two minutes, contribute every three minutes, and unlock after two
                    periods.
                  </Text>
                  <Button
                    icon="clock"
                    title="Create a short ROUND"
                    disabled={!network.canTransact || working}
                    onPress={() => {
                      setQuickTest(true);
                      setCreating(true);
                    }}
                  />
                </Card>
                <Card>
                  <View style={ui.row}>
                    <Feather name="bell" size={22} color={c.ink} />
                    <Text style={ui.heading}>Notifications</Text>
                  </View>
                  <Text style={ui.body}>
                    Creating or joining a ROUND enables start, contribution-window and unlock
                    alerts. Confirmed payments also send a notification. Allow notifications on your
                    phone when asked.
                  </Text>
                </Card>
                <Text style={s.small}>Save together. Stay committed.</Text>
              </>
            )}
          </ScrollView>
          <View style={s.nav}>
            {(
              [
                { id: 'home', icon: 'grid', label: 'Home' },
                { id: 'rounds', icon: 'circle', label: 'Rounds' },
                { id: 'history', icon: 'bar-chart-2', label: 'History' },
                { id: 'profile', icon: 'user', label: 'You' },
              ] as const
            ).map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item.id }}
                key={item.id}
                style={s.navItem}
                onPress={() => {
                  setTab(item.id);
                  setSelected(null);
                }}
              >
                <View style={[s.navIcon, tab === item.id && { backgroundColor: c.lime }]}>
                  <Feather name={item.icon} color={tab === item.id ? c.ink : c.muted} size={20} />
                </View>
                <Text style={[s.navLabel, tab === item.id && { color: c.ink, fontWeight: '700' }]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Sheet
          visible={creating}
          onClose={() => {
            setCreating(false);
            setQuickTest(false);
          }}
          title="Start something good."
        >
          <CreateForm
            key={quickTest ? 'quick' : 'regular'}
            quickTest={quickTest}
            status={network.status || (network.busy ? 'Checking your ROUND…' : network.error)}
            now={now}
            disabled={working || !network.canTransact}
            onCreate={async (input) => {
              validateRules(input, now);
              const result = await network.create(input);
              setCreating(false);
              setSelected(result.id);
              setNotice({
                title: 'Your ROUND is on Solana',
                body:
                  'You have joined your ROUND. Make your first USDC contribution when it starts.' +
                  (result.notificationWarning ? `\n\n${result.notificationWarning}` : ''),
              });
            }}
          />
        </Sheet>
        <Sheet visible={!!invite} onClose={() => setInvite(null)} title="Good habits are shared.">
          {invite && (
            <>
              <Text style={ui.body}>
                Invite your people to {invite.name}. They’ll review the agreement before joining.
              </Text>
              <View style={s.qr}>
                <QRCode value={invitationLink(invite.id, NETWORK)} size={180} color={c.ink} />
              </View>
              <Text selectable style={[ui.body, { textAlign: 'center' }]}>
                {invitationLink(invite.id, NETWORK)}
              </Text>
              <Button
                title="Share invite"
                icon="share-2"
                onPress={async () => {
                  try {
                    await Share.share({
                      message: `Save together in ${invite.name}. ${money(invite.amount)} USDC per ${cadence(invite)}. ${invitationLink(invite.id, NETWORK)}`,
                    });
                  } catch (e) {
                    showError(e);
                  }
                }}
              />
              <Text style={s.small}>
                Share this invitation with your group. Joining closes when the ROUND starts.
              </Text>
            </>
          )}
        </Sheet>
        <Sheet visible={joinOpen} onClose={() => setJoinOpen(false)} title="Find your people.">
          <Text style={ui.body}>
            Paste a ROUND invitation to review the agreement before joining.
          </Text>
          <TextInput
            accessibilityLabel="Invitation link or code"
            placeholder="round://join/…"
            placeholderTextColor={c.muted}
            style={ui.input}
            value={joinId}
            onChangeText={setJoinId}
            autoCapitalize="none"
          />
          <Button
            title="Review ROUND"
            disabled={working}
            onPress={async () => {
              try {
                const parsed = parseInvitation(joinId);
                if (parsed.network && parsed.network !== NETWORK)
                  throw new UserFacingError(
                    'This invitation uses a different Solana network. Open it in a ROUND build for that network.',
                  );
                const item = await network.lookup(parsed.id);
                setJoinOpen(false);
                setSelected(item.id);
              } catch (error) {
                showError(error);
              }
            }}
          />
        </Sheet>
        <Sheet visible={!!notice} onClose={() => setNotice(null)} title={notice?.title ?? ''}>
          <Text style={ui.body}>{notice?.body}</Text>
          <Button title="Got it" onPress={() => setNotice(null)} />
        </Sheet>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <View style={ui.row}>
      <Text style={ui.body}>{label}</Text>
      <Text style={s.memberName}>{value}</Text>
    </View>
  );
}
function RoundCard({
  round: r,
  now,
  viewer,
  onPress,
}: {
  round: Round;
  now: number;
  viewer: string;
  onPress: () => void;
}) {
  const member = r.members.find((m) => m.wallet === viewer);
  const phase = roundPhase(r, now);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.name}`} onPress={onPress}>
      <Card>
        <View style={ui.row}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 }}>
            <View style={[s.roundIcon, { backgroundColor: r.color }]}>
              <Feather name={goalIcon(r.name)} size={28} color={c.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{r.name}</Text>
              <Text style={s.small}>
                {money(r.amount)} USDC / {cadence(r)}
              </Text>
            </View>
          </View>
          <Feather name="arrow-up-right" size={19} color={c.ink} />
        </View>
        <View style={ui.row}>
          <Text style={s.memberAmount}>
            {money(member?.deposited ?? 0)} <Text style={s.small}>/ {money(target(r))} USDC</Text>
          </Text>
          <Text style={s.small}>
            {phase === 'Active'
              ? `${Math.round(((member?.deposited ?? 0) / target(r)) * 100)}% saved`
              : phase === 'Ended' && member
                ? isComplete(r, member)
                  ? 'Completed'
                  : 'Incomplete'
                : 'Starting soon'}
          </Text>
        </View>
        <Progress value={(member?.deposited ?? 0) / target(r)} />
        <View style={ui.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {r.members.slice(0, 4).map((m, i) => (
              <View key={m.wallet} style={{ marginLeft: i ? -9 : 0 }}>
                <Avatar name={m.name} index={i} size={28} />
              </View>
            ))}
            <Text style={[s.small, { marginLeft: 8 }]}>{r.members.length} savers</Text>
          </View>
          <Pill warm={phase === 'Upcoming'}>
            {phase === 'Active'
              ? `${cadence(r).toUpperCase()} ${periodIndex(r, now) + 1} OF ${r.periods}`
              : phase === 'Ended'
                ? member?.withdrawn
                  ? 'WITHDRAWN'
                  : 'READY TO UNLOCK'
                : `STARTS ${date(r.startsAt).toUpperCase()}`}
          </Pill>
        </View>
      </Card>
    </Pressable>
  );
}
function SavingsDetail({
  round: r,
  now,
  viewer,
  disabled,
  onAction,
}: {
  round: Round;
  now: number;
  viewer: string;
  disabled: boolean;
  onAction: (action: 'join' | 'contribute' | 'withdraw') => void;
}) {
  const m = r.members.find((m) => m.wallet === viewer);
  const phase = roundPhase(r, now);
  const paid = m?.paidPeriods.includes(periodIndex(r, now));
  const label = !m
    ? 'Accept agreement & join'
    : m.withdrawn
      ? 'Savings returned'
      : phase === 'Ended'
        ? !hasWithdrawableFunds(m)
          ? 'Nothing to withdraw'
          : m.deposited === 0
            ? `Withdraw ${money(m.bond)} SKR`
            : `Withdraw ${money(m.deposited)} USDC${m.bond ? ' + SKR' : ''}`
        : phase === 'Upcoming'
          ? `Starts ${date(r.startsAt)}`
          : paid
            ? 'You’re up to date'
            : `Contribute ${money(r.amount)} USDC`;
  return (
    <Card>
      <Text style={ui.label}>YOUR PROGRESS</Text>
      <Text style={ui.title}>
        {money(m?.deposited ?? 0)}{' '}
        <Text style={{ fontSize: 16, color: c.muted }}>/ {money(target(r))} USDC</Text>
      </Text>
      <Progress value={(m?.deposited ?? 0) / target(r)} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: r.periods }, (_, i) => (
          <View
            key={i}
            style={[
              s.period,
              m?.paidPeriods.includes(i) && { backgroundColor: c.lime, borderColor: c.lime },
            ]}
          >
            {m?.paidPeriods.includes(i) ? (
              <Feather name="check" size={15} color={c.ink} />
            ) : (
              <Text style={{ color: c.ink, fontSize: 12 }}>{i + 1}</Text>
            )}
          </View>
        ))}
      </View>
      <Text style={ui.body}>
        {phase === 'Ended'
          ? m?.withdrawn
            ? 'Your savings and commitment lock have been returned.'
            : m && !hasWithdrawableFunds(m)
              ? 'This ROUND has ended. You did not deposit USDC or lock SKR, so there is nothing to withdraw.'
              : 'The wait is over. Everything you saved is yours to withdraw.'
          : `Locked until ${dateTime(endsAt(r))}. Your money stays yours, even if you miss a contribution.`}
      </Text>
      {phase !== 'Ended' && (
        <Rule
          label={
            phase === 'Upcoming'
              ? 'Starts in'
              : paid
                ? 'Savings unlock in'
                : 'This period closes in'
          }
          value={countdown(
            (phase === 'Upcoming'
              ? r.startsAt
              : paid
                ? endsAt(r)
                : Math.min(endsAt(r), r.startsAt + (periodIndex(r, now) + 1) * r.periodSeconds)) -
              now,
          )}
        />
      )}
      <Button
        title={label}
        disabled={
          disabled ||
          (m
            ? m.withdrawn ||
              (phase === 'Ended' && !hasWithdrawableFunds(m)) ||
              phase === 'Upcoming' ||
              (phase === 'Active' && paid)
            : phase !== 'Upcoming')
        }
        onPress={() => onAction(!m ? 'join' : phase === 'Ended' ? 'withdraw' : 'contribute')}
      />
    </Card>
  );
}
function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <View style={ui.row}>
            <Text style={[ui.heading, { flex: 1 }]}>{title}</Text>
            <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={s.close}>
              <Feather name="x" size={20} color={c.ink} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function CreateForm({
  quickTest,
  status,
  now,
  disabled,
  onCreate,
}: {
  now: number;
  quickTest: boolean;
  status: string;
  disabled: boolean;
  onCreate: (input: CreateInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(quickTest ? '1' : '20');
  const [periods, setPeriods] = useState(quickTest ? '2' : '5');
  const [frequency, setFrequency] = useState(quickTest ? 180 : 604800);
  const [bond, setBond] = useState(false);
  const [bondAmount, setBondAmount] = useState('100');
  const [error, setError] = useState('');
  return (
    <>
      <Text style={ui.body}>A shared goal starts with a simple agreement.</Text>
      <Text style={ui.label}>WHAT ARE YOU SAVING FOR?</Text>
      <TextInput
        style={ui.input}
        accessibilityLabel="ROUND name"
        placeholder="The laptop fund"
        placeholderTextColor={c.muted}
        maxLength={48}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError('');
        }}
      />
      <View style={ui.row}>
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={ui.label}>USDC PER PERIOD</Text>
          <TextInput
            accessibilityLabel="Contribution amount"
            style={ui.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={ui.label}>CONTRIBUTIONS</Text>
          <TextInput
            accessibilityLabel="Number of contributions"
            style={ui.input}
            value={periods}
            onChangeText={setPeriods}
            keyboardType="number-pad"
          />
        </View>
      </View>
      <Text style={ui.label}>YOUR RHYTHM</Text>
      <View style={ui.row}>
        {[
          { label: 'Weekly', value: 604800 },
          { label: 'Daily', value: 86400 },
          { label: '3 minutes', value: 180 },
        ].map((item) => (
          <Pressable
            key={item.value}
            onPress={() => setFrequency(item.value)}
            style={[
              s.choice,
              frequency === item.value && { backgroundColor: c.lime, borderColor: c.lime },
            ]}
          >
            <Text style={s.link}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={ui.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.memberName}>SKR commitment lock</Text>
          <Text style={s.small}>Always returned in full. No slashing.</Text>
        </View>
        <Switch
          accessibilityLabel="Require SKR commitment lock"
          value={bond}
          onValueChange={setBond}
          trackColor={{ true: c.ink }}
        />
      </View>
      {bond && (
        <TextInput
          accessibilityLabel="SKR amount"
          style={ui.input}
          value={bondAmount}
          onChangeText={setBondAmount}
          keyboardType="decimal-pad"
        />
      )}
      <Card style={{ backgroundColor: c.soft }}>
        <Text style={s.memberName}>Everyone keeps what they save.</Text>
        <Text style={ui.body}>
          Up to 8 members. Starts {frequency === 180 ? 'in two minutes' : 'tomorrow'}. Joining
          closes at the start. Each period accepts one payment; missed periods cannot be made up.
          USDC and SKR stay locked until the end.
        </Text>
        <Text style={s.small}>
          Creating joins you to the ROUND. Your first USDC contribution is paid separately after it
          starts. Any SKR lock is deposited now, along with network fees and account setup costs.
        </Text>
      </Card>
      {status ? (
        <Text accessibilityLiveRegion="polite" style={ui.body}>
          {status}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: '#A13A2C' }}>
          {error}
        </Text>
      ) : null}
      <Button
        title={status && disabled ? status : 'Create ROUND'}
        icon="plus"
        disabled={disabled}
        onPress={async () => {
          setError('');
          try {
            const input = {
              name,
              amount: parseAmount(amount),
              periods: Number(periods),
              periodSeconds: frequency,
              startsAt: now + (frequency === 180 ? 120 : 86400),
              maxMembers: 8,
              bond: bond ? parseAmount(bondAmount) : 0,
              emoji: '',
              color: '#E6EFD8',
            };
            validateRules(input, now);
            await onCreate(input);
          } catch (e) {
            setError(userMessage(e));
          }
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EAEEE3' },
  shell: {
    flex: 1,
    backgroundColor: c.paper,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 25,
    paddingTop: 17,
    paddingBottom: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoHole: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.lime },
  wordmark: { fontSize: 30, fontWeight: '800', color: c.ink, letterSpacing: -1.8 },
  networkDot: { height: 5, width: 5, backgroundColor: '#8BA665', borderRadius: 3 },
  network: { fontSize: 9, letterSpacing: 1.1, color: c.muted, marginLeft: -6 },
  content: { padding: 24, paddingTop: 26, gap: 23 },
  eyebrow: { fontSize: 9, letterSpacing: 1.65, fontWeight: '700', color: c.muted, marginBottom: 5 },
  greeting: {
    fontSize: 32,
    letterSpacing: -1.3,
    fontWeight: '600',
    lineHeight: 38,
    color: c.ink,
    maxWidth: 320,
  },
  balanceCard: {
    backgroundColor: c.ink,
    padding: 24,
    borderRadius: 25,
    gap: 10,
    overflow: 'hidden',
  },
  balanceLabel: { color: '#B7CBB8', fontSize: 10, letterSpacing: 1.5, fontWeight: '600' },
  lockTag: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  balance: { color: '#F9FCEB', fontSize: 59, fontWeight: '500', letterSpacing: -3, marginTop: 8 },
  currency: { color: '#ACBEA6', fontSize: 17 },
  balanceHint: { color: '#B5C9B2', fontSize: 12 },
  balanceDivider: { height: 1, backgroundColor: '#45614E', marginVertical: 10 },
  balanceFoot: { color: '#D5E3C9', fontSize: 11 },
  limeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.lime },
  orbitOne: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderWidth: 1,
    borderColor: '#365846',
    borderRadius: 100,
    right: -76,
    top: 30,
    zIndex: -1,
  },
  orbitTwo: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderWidth: 1,
    borderColor: '#365846',
    borderRadius: 80,
    right: -50,
    top: 55,
    zIndex: -1,
  },
  dueCard: {
    backgroundColor: '#EEF3DE',
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dueIcon: {
    backgroundColor: c.lime,
    height: 39,
    width: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  dueTitle: { color: c.ink, fontWeight: '700', fontSize: 13 },
  count: { fontSize: 13, color: c.muted },
  link: { fontSize: 12, color: c.ink, fontWeight: '700' },
  small: { fontSize: 11, color: c.muted, lineHeight: 17 },
  roundIcon: {
    height: 46,
    width: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.ink,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  memberName: { color: c.ink, fontSize: 14, fontWeight: '600' },
  memberAmount: { color: c.ink, fontSize: 14, fontWeight: '600' },
  communityCard: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10 },
  communityArt: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  miniOrbit: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#CBD7B8',
  },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nav: {
    flexDirection: 'row',
    backgroundColor: c.paper,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
    paddingBottom: 10,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 5, minHeight: 51 },
  navIcon: { paddingVertical: 6, paddingHorizontal: 17, borderRadius: 17 },
  navLabel: { fontSize: 10, color: c.muted },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  period: {
    height: 30,
    width: 30,
    borderRadius: 10,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    flex: 1,
    backgroundColor: '#102D2466',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: c.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 25,
    paddingBottom: 12,
    gap: 24,
  },
  close: { backgroundColor: c.soft, padding: 8, borderRadius: 18 },
  qr: {
    alignItems: 'center',
    padding: 25,
    backgroundColor: 'white',
    alignSelf: 'center',
    borderRadius: 20,
  },
  choice: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
  },
});

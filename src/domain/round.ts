import { UserFacingError } from '../services/errors';
export type Member = {
  wallet: string;
  name: string;
  paidPeriods: number[];
  deposited: number;
  bond: number;
  withdrawn: boolean;
};
export type Round = {
  id: string;
  name: string;
  emoji: string;
  creator: string;
  amount: number;
  periodSeconds: number;
  periods: number;
  startsAt: number;
  maxMembers: number;
  bond: number;
  members: Member[];
  color: string;
};
export type CreateInput = Omit<Round, 'members' | 'id' | 'creator'>;
export const hasWithdrawableFunds = (member: Member) =>
  !member.withdrawn && (member.deposited > 0 || member.bond > 0);
export const UNIT = 1_000_000;
export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const endsAt = (round: Round) => round.startsAt + round.periodSeconds * round.periods;
export const target = (round: Round) => round.amount * round.periods;
export const periodIndex = (round: Round, now: number) =>
  Math.floor((now - round.startsAt) / round.periodSeconds);
export const roundPhase = (round: Round, now: number) =>
  now < round.startsAt ? 'Upcoming' : now >= endsAt(round) ? 'Ended' : 'Active';
export const isComplete = (round: Round, member: Member) =>
  member.paidPeriods.length === round.periods;
export const money = (units: number) =>
  (units / UNIT).toLocaleString('en-US', { maximumFractionDigits: 6 });
export function parseAmount(value: string): number {
  if (!/^\d+(\.\d{1,6})?$/.test(value.trim()))
    throw new UserFacingError('Enter an amount with up to 6 decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const units = Number(whole) * UNIT + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(units) || units <= 0)
    throw new UserFacingError('Enter a valid amount greater than zero.');
  return units;
}
export function validateRules(input: CreateInput, now: number) {
  if (!input.name.trim()) throw new UserFacingError('Give your ROUND a name before continuing.');
  if (input.name.trim().length > 48 || new TextEncoder().encode(input.name.trim()).length > 96)
    throw new UserFacingError(
      'Give your ROUND a name using up to 48 characters. If you use emoji, try a shorter name.',
    );
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    !Number.isSafeInteger(input.amount * input.periods)
  )
    throw new UserFacingError(
      'Enter a contribution amount greater than zero and within the supported limit.',
    );
  if (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > 52)
    throw new UserFacingError('Choose between 1 and 52 contributions.');
  if (
    !Number.isInteger(input.periodSeconds) ||
    input.periodSeconds < 30 ||
    input.periodSeconds > 31 * 86400
  )
    throw new UserFacingError('Each contribution period must last between 30 seconds and 31 days.');
  if (!Number.isSafeInteger(input.startsAt) || input.startsAt <= now)
    throw new UserFacingError('The start date must be in the future.');
  if (!Number.isSafeInteger(input.startsAt + input.periodSeconds * input.periods))
    throw new UserFacingError('The end date is out of range.');
  if (!Number.isInteger(input.maxMembers) || input.maxMembers < 2 || input.maxMembers > 20)
    throw new UserFacingError('Choose between 2 and 20 members.');
  if (!Number.isSafeInteger(input.bond) || input.bond < 0)
    throw new UserFacingError('Enter a valid SKR lock amount, or turn the commitment lock off.');
}
export function join(round: Round, wallet: string, name: string, now: number): Round {
  if (now >= round.startsAt)
    throw new UserFacingError('This ROUND has started. Joining is closed.');
  if (round.members.some((m) => m.wallet === wallet))
    throw new UserFacingError('You already joined this ROUND.');
  if (round.members.length >= round.maxMembers) throw new UserFacingError('This ROUND is full.');
  return {
    ...round,
    members: [
      ...round.members,
      { wallet, name, paidPeriods: [], deposited: 0, bond: round.bond, withdrawn: false },
    ],
  };
}
export function contribute(round: Round, wallet: string, now: number): Round {
  const period = periodIndex(round, now);
  if (period < 0) throw new UserFacingError('Contributions open when this ROUND starts.');
  if (period >= round.periods)
    throw new UserFacingError('This ROUND has ended. Your savings are ready to withdraw.');
  const member = round.members.find((m) => m.wallet === wallet);
  if (!member) throw new UserFacingError('Join this ROUND before contributing.');
  if (member.paidPeriods.includes(period))
    throw new UserFacingError('You already paid for this period.');
  return {
    ...round,
    members: round.members.map((m) =>
      m.wallet !== wallet
        ? m
        : { ...m, paidPeriods: [...m.paidPeriods, period], deposited: m.deposited + round.amount },
    ),
  };
}
export function withdraw(round: Round, wallet: string, now: number): Round {
  if (now < endsAt(round))
    throw new UserFacingError('Your savings stay locked until the ROUND ends.');
  const member = round.members.find((m) => m.wallet === wallet);
  if (!member) throw new UserFacingError('You are not a member of this ROUND.');
  if (member.withdrawn)
    throw new UserFacingError('Your savings and commitment lock have already been returned.');
  if (!hasWithdrawableFunds(member))
    throw new UserFacingError(
      'Nothing to withdraw. You did not deposit USDC or lock SKR in this ROUND.',
    );
  return {
    ...round,
    members: round.members.map((m) => (m.wallet !== wallet ? m : { ...m, withdrawn: true })),
  };
}

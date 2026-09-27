import { endsAt, type Round } from './round';

/** Display-only preview; never changes the clock used for a transaction. */
export function nextPreviewTime(round: Round, current: number): number {
  if (current < round.startsAt) return round.startsAt;
  const nextPeriod = Math.floor((current - round.startsAt) / round.periodSeconds) + 1;
  return Math.min(endsAt(round), round.startsAt + nextPeriod * round.periodSeconds);
}

export function contributionCountdown(round: Round, now: number, paid: boolean) {
  if (now < round.startsAt) return { label: 'Starts in', at: round.startsAt };
  const next = nextPreviewTime(round, now);
  return {
    label: paid
      ? next < endsAt(round)
        ? 'Next contribution opens in'
        : 'Savings unlock in'
      : 'This period closes in',
    at: next,
  };
}

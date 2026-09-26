import { endsAt, type Round } from './round';

/** Display-only preview; never changes the clock used for a transaction. */
export function nextPreviewTime(round: Round, current: number): number {
  if (current < round.startsAt) return round.startsAt;
  const nextPeriod = Math.floor((current - round.startsAt) / round.periodSeconds) + 1;
  return Math.min(endsAt(round), round.startsAt + nextPeriod * round.periodSeconds);
}

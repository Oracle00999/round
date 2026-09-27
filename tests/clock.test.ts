import { describe, expect, it } from 'vitest';
import { nextPreviewTime, contributionCountdown } from '../src/domain/clock';
import { type Round } from '../src/domain/round';

describe('clock preview', () => {
  const round = { startsAt: 1000, periodSeconds: 60, periods: 2 } as Round;
  it('jumps to start, next period, then caps at unlock without mutating the round', () => {
    const before = JSON.stringify(round);
    expect(nextPreviewTime(round, 900)).toBe(1000);
    expect(nextPreviewTime(round, 1000)).toBe(1060);
    expect(nextPreviewTime(round, 1070)).toBe(1120);
    expect(nextPreviewTime(round, 1120)).toBe(1120);
    expect(JSON.stringify(round)).toBe(before);
  });
});

it('keeps the next window countdown after payment and shows unlock only in the final period', () => {
  const round = { startsAt: 1000, periodSeconds: 30, periods: 2 } as Round;
  expect(contributionCountdown(round, 990, false)).toEqual({ label: 'Starts in', at: 1000 });
  expect(contributionCountdown(round, 1005, false)).toEqual({
    label: 'This period closes in',
    at: 1030,
  });
  expect(contributionCountdown(round, 1005, true)).toEqual({
    label: 'Next contribution opens in',
    at: 1030,
  });
  expect(contributionCountdown(round, 1030, false)).toEqual({
    label: 'This period closes in',
    at: 1060,
  });
  expect(contributionCountdown(round, 1035, true)).toEqual({
    label: 'Savings unlock in',
    at: 1060,
  });
});

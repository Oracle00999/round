import { describe, expect, it } from 'vitest';
import { nextPreviewTime } from '../src/domain/clock';
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

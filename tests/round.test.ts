import { describe, it, expect } from 'vitest';
import {
  contribute,
  withdraw,
  join,
  parseAmount,
  money,
  isComplete,
  endsAt,
  validateRules,
  type Round,
} from '../src/domain/round';
const base = (): Round => ({
  id: 'r',
  name: 'Test',
  creator: 'a',
  emoji: '↗',
  color: '#fff',
  amount: 20_000_000,
  periodSeconds: 60,
  periods: 3,
  startsAt: 1000,
  maxMembers: 2,
  bond: 100_000_000,
  members: [],
});
describe('financial rules', () => {
  it('returns all savings and bond for an incomplete member at expiry', () => {
    let r = join(base(), 'a', 'Ada', 900);
    r = contribute(r, 'a', 1000);
    expect(() => withdraw(r, 'a', 1179)).toThrow('locked');
    r = withdraw(r, 'a', endsAt(r));
    expect(r.members[0]).toMatchObject({
      deposited: 20_000_000,
      bond: 100_000_000,
      withdrawn: true,
    });
    expect(isComplete(r, r.members[0])).toBe(false);
    expect(() => withdraw(r, 'a', 1200)).toThrow('already');
  });
  it('enforces boundaries, membership and one payment per period', () => {
    const r = join(base(), 'a', 'Ada', 999);
    expect(() => join(r, 'a', 'Ada', 999)).toThrow('already');
    expect(() => join(r, 'b', 'Ben', 1000)).toThrow('closed');
    expect(() => contribute(r, 'a', 999)).toThrow('open');
    expect(() => contribute(r, 'b', 1000)).toThrow('Join');
    const paid = contribute(r, 'a', 1059);
    expect(() => contribute(paid, 'a', 1059)).toThrow('already');
    expect(contribute(paid, 'a', 1060).members[0].paidPeriods).toEqual([0, 1]);
    expect(() => contribute(r, 'a', 1180)).toThrow('ended');
  });
  it('never mixes member balances or backfills a missed period', () => {
    let r = join(join(base(), 'a', 'Ada', 900), 'b', 'Ben', 900);
    r = contribute(contribute(r, 'a', 1000), 'b', 1120);
    r = withdraw(r, 'b', 1180);
    expect(r.members[0]).toMatchObject({ deposited: 20_000_000, withdrawn: false });
    expect(r.members[1].paidPeriods).toEqual([2]);
  });
  it('marks all contributions complete without requiring withdrawal', () => {
    let r = join(base(), 'a', 'Ada', 900);
    for (const time of [1000, 1060, 1120]) r = contribute(r, 'a', time);
    expect(isComplete(r, r.members[0])).toBe(true);
    expect(r.members[0].withdrawn).toBe(false);
  });
  it('parses token amounts without floating point rounding', () => {
    expect(money(1)).toBe('0.000001');
    expect(parseAmount('0.000001')).toBe(1);
    expect(parseAmount('20.12')).toBe(20_120_000);
    for (const value of ['0', '-1', 'NaN', '1e6', '1.0000001', '9007199254740992'])
      expect(() => parseAmount(value)).toThrow();
  });
  it('validates rules and capacity', () => {
    expect(() => validateRules({ ...base(), startsAt: 900 }, 900)).toThrow('future');
    expect(() => validateRules({ ...base(), periods: 53 }, 900)).toThrow('52');
    const full = join(join(base(), 'a', 'Ada', 900), 'b', 'Ben', 900);
    expect(() => join(full, 'c', 'Cam', 900)).toThrow('full');
  });
});

it('blocks an empty withdrawal but permits an SKR-only refund', () => {
  const empty = join({ ...base(), bond: 0 }, 'a', 'Ada', 900);
  expect(() => withdraw(empty, 'a', 1180)).toThrow('Nothing to withdraw');
  expect(empty.members[0].withdrawn).toBe(false);
  const bonded = join(base(), 'a', 'Ada', 900);
  expect(withdraw(bonded, 'a', 1180).members[0]).toMatchObject({
    deposited: 0,
    bond: 100_000_000,
    withdrawn: true,
  });
});

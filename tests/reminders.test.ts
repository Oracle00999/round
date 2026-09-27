import { describe, it, expect } from 'vitest';
import { reminderPlan } from '../src/domain/reminders';
import { validateRules, type Round } from '../src/domain/round';
const round: Round = {
  id: 'r',
  creator: 'a',
  name: 'Presentation',
  amount: 1000000,
  periodSeconds: 30,
  periods: 2,
  startsAt: 1000,
  maxMembers: 2,
  bond: 0,
  members: [],
  emoji: '',
  color: '#fff',
};
describe('presentation reminders and timing', () => {
  it('accepts 30 seconds and rejects shorter windows', () => {
    expect(() => validateRules(round, 900)).not.toThrow();
    expect(() => validateRules({ ...round, periodSeconds: 29 }, 900)).toThrow('30 seconds');
  });
  it('schedules each opening and the actual unlock time', () => {
    expect(reminderPlan(round, 900).map((x) => x.at)).toEqual([1000, 1030, 1060]);
  });
  it('catches up the start only during its contribution window', () => {
    expect(reminderPlan(round, 1000).map((x) => x.at)).toEqual([1001, 1030, 1060]);
    expect(reminderPlan(round, 1031).map((x) => x.at)).toEqual([1060]);
    expect(reminderPlan(round, 1060)).toEqual([]);
  });
});

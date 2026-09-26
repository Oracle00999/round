import { endsAt, type Round } from './round';

export function reminderPlan(round: Round, now: number) {
  const events = Array.from({ length: round.periods }, (_, period) => ({
    at: round.startsAt + round.periodSeconds * period,
    title: period === 0 ? 'Your ROUND has started' : 'Your next contribution is open',
    body: `Contribution ${period + 1} is open in ${round.name}.`,
  }));
  events.push({
    at: endsAt(round),
    title: 'Your ROUND has finished',
    body: `Your savings in ${round.name} are ready to withdraw.`,
  });
  return events.filter((event) => event.at > now);
}

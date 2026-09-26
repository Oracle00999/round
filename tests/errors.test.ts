import { describe, expect, it } from 'vitest';
import { UserFacingError, userMessage, simulationMessage } from '../src/services/errors';
import { PendingConfirmationError } from '../src/chain/confirmation';

describe('user-facing errors', () => {
  it('never exposes raw Java, RPC, or unexpected exceptions', () => {
    for (const error of [
      new Error('java.lang.IllegalStateException: internal details'),
      new Error('AnchorError: 0x1771'),
      { message: 'secret stack' },
      null,
    ]) {
      const message = userMessage(error);
      expect(message).not.toMatch(/java\.|AnchorError|0x1771|secret|stack/);
      expect(message).toContain('check its status');
    }
  });
  it('preserves explicitly authored validation messages', () => {
    expect(userMessage(new UserFacingError('Choose between 1 and 52 contributions.'))).toBe(
      'Choose between 1 and 52 contributions.',
    );
  });
  it('explains cancellation without claiming a signed payment failed', () => {
    expect(userMessage({ code: -3 })).toContain('not approved');
    expect(userMessage(new Error('java.io.IOException: socket timeout'))).toContain(
      'check its status',
    );
  });
  it('keeps unconfirmed payments pending', () => {
    expect(
      userMessage(
        new PendingConfirmationError({
          signature: 'test',
          blockhash: 'test',
          lastValidBlockHeight: 1,
          owner: 'test',
          label: 'pay',
          createdAt: 0,
        }),
      ),
    ).toContain('not confirmed yet');
  });
  it('explains fee shortages and transaction rules', () => {
    expect(simulationMessage([], { InsufficientFundsForRent: {} })).toContain('SOL');
    expect(simulationMessage(['Error Code: AlreadyPaid'], {})).toContain('already contributed');
    expect(simulationMessage(['Error Code: Locked'], {})).toContain('when this ROUND ends');
    expect(simulationMessage(['java.whatever unknown'], {})).not.toContain('java');
  });
});

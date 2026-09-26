import { describe, expect, it } from 'vitest';
import { invitationLink, parseInvitation } from '../src/domain/invites';
describe('invitations', () => {
  it('keeps demo and devnet invitations distinct', () => {
    expect(parseInvitation(invitationLink('abc123', 'devnet'))).toEqual({
      id: 'abc123',
      network: 'devnet',
    });
    expect(parseInvitation(invitationLink('weekend-crew', 'demo'))).toEqual({
      id: 'weekend-crew',
      network: 'demo',
    });
    expect(parseInvitation(invitationLink('abc123', 'mainnet-beta'))).toEqual({
      id: 'abc123',
      network: 'mainnet-beta',
    });
    expect(parseInvitation(' weekend-crew ')).toEqual({ id: 'weekend-crew' });
  });
  it('rejects foreign links and unsupported networks', () => {
    for (const value of [
      'https://evil.example/join/id',
      'round://elsewhere/id',
      'round://join/id?network=unknown',
      'round://join/',
      'round://join/a/b',
      'round://attacker@join/id',
    ])
      expect(() => parseInvitation(value)).toThrow();
  });
});

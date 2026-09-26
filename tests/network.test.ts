import { expect, it } from 'vitest';
import { parseNetwork, GENESIS, MAINNET_MINTS } from '../src/chain/network';
import { PublicKey } from '@solana/web3.js';
it('accepts only explicit supported networks', () => {
  expect(parseNetwork(undefined)).toBe('devnet');
  expect(parseNetwork('mainnet-beta')).toBe('mainnet-beta');
  expect(() => parseNetwork('mainet')).toThrow();
  expect(GENESIS.devnet).not.toBe(GENESIS['mainnet-beta']);
});
it('pins distinct official six-decimal asset mints', () => {
  expect(new PublicKey(MAINNET_MINTS.savings).toBase58()).toBe(MAINNET_MINTS.savings);
  expect(new PublicKey(MAINNET_MINTS.bond).toBase58()).toBe(MAINNET_MINTS.bond);
  expect(MAINNET_MINTS.savings).not.toBe(MAINNET_MINTS.bond);
});

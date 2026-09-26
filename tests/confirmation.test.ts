import { describe, expect, it, vi } from 'vitest';
import { transactionState, type PendingTransaction } from '../src/chain/confirmation';
const pending: PendingTransaction = {
  signature: 'signature',
  blockhash: 'hash',
  lastValidBlockHeight: 100,
  owner: 'owner',
  label: 'Save',
  createdAt: 0,
};
describe('transaction reconciliation', () => {
  it('does not treat an RPC response containing an execution error as success', async () => {
    const rpc = {
      getSignatureStatuses: vi.fn().mockResolvedValue({
        value: [{ err: { InstructionError: [0, 'Custom'] }, confirmationStatus: 'confirmed' }],
      }),
      getBlockHeight: vi.fn(),
    };
    expect(await transactionState(rpc, pending)).toBe('failed');
  });
  it('keeps unknown signatures pending until blockhash expiry', async () => {
    const rpc = {
      getSignatureStatuses: vi.fn().mockResolvedValue({ value: [null] }),
      getBlockHeight: vi.fn().mockResolvedValue(99),
    };
    expect(await transactionState(rpc, pending)).toBe('pending');
  });
  it('does not retry processed transactions just because their blockhash expired', async () => {
    const rpc = {
      getSignatureStatuses: vi
        .fn()
        .mockResolvedValue({ value: [{ err: null, confirmationStatus: 'processed' }] }),
      getBlockHeight: vi.fn().mockResolvedValue(101),
    };
    expect(await transactionState(rpc, pending)).toBe('pending');
  });
  it('rechecks history when expiry races confirmation', async () => {
    const rpc = {
      getSignatureStatuses: vi
        .fn()
        .mockResolvedValueOnce({ value: [null] })
        .mockResolvedValueOnce({ value: [{ err: null, confirmationStatus: 'confirmed' }] }),
      getBlockHeight: vi.fn().mockResolvedValue(101),
    };
    expect(await transactionState(rpc, pending)).toBe('confirmed');
  });
  it('marks absent expired signatures safe to retry', async () => {
    const rpc = {
      getSignatureStatuses: vi.fn().mockResolvedValue({ value: [null] }),
      getBlockHeight: vi.fn().mockResolvedValue(101),
    };
    expect(await transactionState(rpc, pending)).toBe('expired');
  });
  it('propagates a connection error without declaring the transfer failed', async () => {
    const rpc = {
      getSignatureStatuses: vi.fn().mockRejectedValue(new Error('offline')),
      getBlockHeight: vi.fn(),
    };
    await expect(transactionState(rpc, pending)).rejects.toThrow('offline');
  });
});

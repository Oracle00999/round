import { describe, expect, it, vi } from 'vitest';
import { Connection, Keypair, SystemProgram } from '@solana/web3.js';
import { RoundClient } from '../src/chain/client';
import { DEFAULT_PROGRAM_ID } from '../src/chain/instructions';
const config = () => ({
  programId: DEFAULT_PROGRAM_ID,
  savingsMint: Keypair.generate().publicKey,
  bondMint: Keypair.generate().publicKey,
});
describe('network and invitation trust boundaries', () => {
  it('rejects any RPC network with a different genesis hash before requesting signatures', async () => {
    const rpc = {
      getGenesisHash: vi.fn().mockResolvedValue('mainnet-or-another-network'),
      getAccountInfo: vi.fn().mockResolvedValue({ executable: true }),
    };
    await expect(
      new RoundClient(rpc as unknown as Connection, config()).verifyDeployment(),
    ).rejects.toThrow('configured network');
  });
  it('rejects a substituted program ID', async () => {
    const rpc = { getGenesisHash: vi.fn(), getAccountInfo: vi.fn() };
    await expect(
      new RoundClient(rpc as unknown as Connection, {
        ...config(),
        programId: SystemProgram.programId,
      }).verifyDeployment(),
    ).rejects.toThrow('does not match');
    expect(rpc.getAccountInfo).not.toHaveBeenCalled();
  });
  it('reports an undeployed program clearly', async () => {
    const rpc = {
      getGenesisHash: vi.fn().mockResolvedValue('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'),
      getAccountInfo: vi.fn().mockResolvedValue(null),
    };
    await expect(
      new RoundClient(rpc as unknown as Connection, config()).verifyDeployment(),
    ).rejects.toThrow('not deployed');
  });
  it('rejects invitation accounts owned by another program', async () => {
    const rpc = {
      getAccountInfo: vi
        .fn()
        .mockResolvedValue({ owner: SystemProgram.programId, data: Buffer.alloc(20) }),
    };
    await expect(
      new RoundClient(rpc as unknown as Connection, config()).fetchRound(
        Keypair.generate().publicKey.toBase58(),
        'viewer',
      ),
    ).rejects.toThrow('does not belong');
  });
});

it('rejects counterfeit mainnet mints before any RPC call', async () => {
  const rpc = { getGenesisHash: vi.fn() };
  await expect(
    new RoundClient(
      rpc as unknown as Connection,
      config(),
      '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    ).verifyDeployment(),
  ).rejects.toThrow('official USDC and SKR');
  expect(rpc.getGenesisHash).not.toHaveBeenCalled();
});

it('blocks an empty withdrawal before asking the wallet to sign', async () => {
  const owner = Keypair.generate().publicKey;
  const client = new RoundClient({} as Connection, config());
  vi.spyOn(client, 'verifyDeployment').mockResolvedValue(undefined);
  vi.spyOn(client, 'fetchRound').mockResolvedValue({
    members: [{ wallet: owner.toBase58(), deposited: 0, bond: 0, withdrawn: false }],
  } as any);
  const submit = vi.fn();
  await expect(
    client.act(Keypair.generate().publicKey.toBase58(), owner, 'withdraw', submit),
  ).rejects.toThrow('Nothing to withdraw');
  expect(submit).not.toHaveBeenCalled();
});

it('caches successful background verification but rechecks before payments', async () => {
  const client = new RoundClient({} as Connection, config());
  const check = vi.spyOn(client as any, 'checkDeployment').mockResolvedValue(undefined);
  await Promise.all([client.verifyDeployment(false), client.verifyDeployment(false)]);
  await client.verifyDeployment(false);
  expect(check).toHaveBeenCalledTimes(1);
  await client.verifyDeployment();
  expect(check).toHaveBeenCalledTimes(2);
});
it('does not cache failed network verification', async () => {
  const client = new RoundClient({} as Connection, config());
  const check = vi
    .spyOn(client as any, 'checkDeployment')
    .mockRejectedValueOnce(new Error('429'))
    .mockResolvedValue(undefined);
  await expect(client.verifyDeployment(false)).rejects.toThrow('429');
  await client.verifyDeployment(false);
  expect(check).toHaveBeenCalledTimes(2);
});

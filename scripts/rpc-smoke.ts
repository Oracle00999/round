import assert from 'node:assert/strict';
import {
  Connection,
  ComputeBudgetProgram,
  Keypair,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { RoundClient, type Submit } from '../src/chain/client';
import { DEFAULT_PROGRAM_ID } from '../src/chain/instructions';
import { transactionState } from '../src/chain/confirmation';

const connection = new Connection('http://127.0.0.1:18999', 'confirmed');
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const alice = Keypair.generate(),
    bob = Keypair.generate();
  for (const owner of [alice, bob]) {
    const signature = await connection.requestAirdrop(owner.publicKey, 10_000_000_000);
    for (let i = 0; i < 30; i++) {
      const status = (await connection.getSignatureStatuses([signature])).value[0];
      if (status?.err) throw new Error('Local funding failed');
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized')
        break;
      await pause(300);
    }
  }
  const savingsMint = await createMint(connection, alice, alice.publicKey, null, 6);
  const bondMint = await createMint(connection, alice, alice.publicKey, null, 6);
  for (const owner of [alice, bob])
    for (const mint of [savingsMint, bondMint]) {
      const ata = await getOrCreateAssociatedTokenAccount(connection, alice, mint, owner.publicKey);
      await mintTo(connection, alice, mint, ata.address, alice, 1_000_000_000n);
    }
  const client = new RoundClient(
    connection,
    { programId: DEFAULT_PROGRAM_ID, savingsMint, bondMint },
    await connection.getGenesisHash(),
  );
  await client.verifyDeployment();
  const submit =
    (signer: Keypair): Submit =>
    async (instructions, label) => {
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ...instructions,
      );
      const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
        commitment: 'confirmed',
      });
      console.log(`${label}: confirmed`);
      return signature;
    };
  const startsAt = (await client.chainTime()) + 15;
  const result = await client.create(
    alice.publicKey,
    {
      name: 'RPC lifecycle',
      amount: 20_000_000,
      bond: 100_000_000,
      periods: 1,
      periodSeconds: 60,
      startsAt,
      maxMembers: 2,
      color: '#fff',
      emoji: '✳',
    },
    submit(alice),
  );
  const viewed = await client.fetchRound(result.id, bob.publicKey.toBase58());
  assert.equal(viewed.members.length, 1);
  await client.act(result.id, bob.publicKey, 'join', submit(bob));
  assert.equal((await client.myRounds(bob.publicKey)).length, 1);
  assert.equal((await client.balances(bob.publicKey)).bond, 900_000_000);
  console.log('Cross-wallet invitation lookup and membership query: passed');
  const waitUntil = async (timestamp: number) => {
    const deadline = Date.now() + 120_000;
    while ((await client.chainTime()) < timestamp) {
      if (Date.now() > deadline) throw new Error('Validator clock did not advance');
      await pause(1000);
    }
  };
  await waitUntil(startsAt);
  const deposit = await client.act(result.id, alice.publicKey, 'contribute', submit(alice));
  assert.equal((await client.balances(alice.publicKey)).savings, 980_000_000);
  await assert.rejects(client.act(result.id, alice.publicKey, 'withdraw', submit(alice)));
  console.log('Early withdrawal rejected. Waiting for the real local-validator unlock time…');
  await waitUntil(startsAt + 60);
  await client.act(result.id, bob.publicKey, 'withdraw', submit(bob));
  await client.act(result.id, alice.publicKey, 'withdraw', submit(alice));
  for (const owner of [alice, bob]) {
    const balance = await client.balances(owner.publicKey);
    assert.equal(balance.savings, 1_000_000_000);
    assert.equal(balance.bond, 1_000_000_000);
  }
  const final = await client.fetchRound(result.id, alice.publicKey.toBase58());
  assert.equal(
    final.members.find((m) => m.wallet === alice.publicKey.toBase58())?.paidPeriods.length,
    1,
  );
  assert.equal(
    final.members.find((m) => m.wallet === bob.publicKey.toBase58())?.paidPeriods.length,
    0,
  );
  assert(final.members.every((m) => m.withdrawn));
  assert.equal(
    await transactionState(connection, {
      signature: deposit.signature,
      owner: alice.publicKey.toBase58(),
      label: 'Contribute',
      blockhash: '',
      lastValidBlockHeight: 0,
      createdAt: 0,
    }),
    'confirmed',
  );
  console.log(
    'PASS: complete RPC lifecycle, confirmed account reads, and full independent refunds.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

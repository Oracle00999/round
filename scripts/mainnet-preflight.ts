import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { DEFAULT_PROGRAM_ID } from '../src/chain/instructions';
import { GENESIS, MAINNET_MINTS } from '../src/chain/network';

async function main() {
  const rpc = process.env.ROUND_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpc, 'confirmed');
  if ((await connection.getGenesisHash()) !== GENESIS['mainnet-beta'])
    throw new Error('Expected mainnet RPC.');
  for (const mint of Object.values(MAINNET_MINTS)) {
    const info = await getMint(connection, new PublicKey(mint));
    if (info.decimals !== 6) throw new Error('Unsupported mainnet token decimals.');
  }
  mkdirSync('.local', { recursive: true });
  const bufferPath = '.local/mainnet-buffer.json';
  if (!existsSync(bufferPath)) writeFileSync(bufferPath, JSON.stringify([...Keypair.generate().secretKey]), {mode:0o600,flag:'wx'});
  const path = '.local/mainnet-deployer.json';
  if (!existsSync(path)) {
    const key = Keypair.generate();
    writeFileSync(path, JSON.stringify([...key.secretKey]), { mode: 0o600, flag: 'wx' });
  }
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
  const programKey = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync('.local/round-program-keypair.json', 'utf8'))),
  );
  if (!programKey.publicKey.equals(DEFAULT_PROGRAM_ID))
    throw new Error('Program key does not match compiled program ID.');
  const binary = readFileSync('target/deploy/round.so');
  const [bufferRent, programDataRent, programRent, balance, program] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(binary.length + 37),
    connection.getMinimumBalanceForRentExemption(binary.length + 45),
    connection.getMinimumBalanceForRentExemption(36),
    connection.getBalance(deployer.publicKey),
    connection.getAccountInfo(DEFAULT_PROGRAM_ID),
  ]);
  const report = {
    network: 'mainnet-beta',
    program: DEFAULT_PROGRAM_ID.toBase58(),
    deployed: !!program?.executable,
    deployer: deployer.publicKey.toBase58(),
    balanceSOL: balance / 1e9,
    binaryBytes: binary.length,
    sha256: createHash('sha256').update(binary).digest('hex'),
    programRentSOL: (programDataRent + programRent) / 1e9,
    temporaryBufferRentSOL: bufferRent / 1e9,
    conservativeFundingSOL:
      Math.ceil((bufferRent + programDataRent + programRent + 10_000_000) / 10_000_000) / 100,
    note: 'Conservative estimate includes temporary buffer plus program rent and 0.01 SOL fee reserve. Actual deployment may reuse buffer rent. No transaction submitted.',
  };
  writeFileSync('.local/mainnet-preflight.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { DEFAULT_PROGRAM_ID } from '../src/chain/instructions';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC, 'confirmed');
const DEVNET = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
mkdirSync('.local', { recursive: true });
function key(name: string) {
  const path = `.local/${name}.json`;
  if (existsSync(path))
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
  const generated = Keypair.generate();
  writeFileSync(path, JSON.stringify([...generated.secretKey]), { mode: 0o600 });
  return generated;
}
const deployer = key('devnet-deployer');
const savings = key('devnet-test-usdc');
const bond = key('devnet-test-skr');

function writeConfig() {
  const config = {
    EXPO_PUBLIC_SOLANA_RPC_URL: RPC,
    EXPO_PUBLIC_ROUND_PROGRAM_ID: DEFAULT_PROGRAM_ID.toBase58(),
    EXPO_PUBLIC_USDC_MINT: savings.publicKey.toBase58(),
    EXPO_PUBLIC_SKR_MINT: bond.publicKey.toBase58(),
  };
  const previous = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const lines = previous
    .split('\n')
    .filter((line) => !Object.keys(config).some((key) => line.startsWith(`${key}=`)));
  writeFileSync(
    '.env',
    [
      ...lines.filter(Boolean),
      ...Object.entries(config).map(([key, value]) => `${key}=${value}`),
      '',
    ].join('\n'),
  );
  console.log(
    'Prepared app configuration for test tokens. Program and mint accounts must exist before transactions can succeed.',
  );
  console.log(config);
}

async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'prepare') {
    writeConfig();
    return;
  }
  if ((await connection.getGenesisHash()) !== DEVNET)
    throw new Error('Refusing to run outside Solana devnet.');
  if (command === 'status') {
    const accounts = await connection.getMultipleAccountsInfo([
      DEFAULT_PROGRAM_ID,
      savings.publicKey,
      bond.publicKey,
    ]);
    console.log({
      deployer: deployer.publicKey.toBase58(),
      devnetSOL: (await connection.getBalance(deployer.publicKey)) / 1e9,
      program: DEFAULT_PROGRAM_ID.toBase58(),
      programDeployed: !!accounts[0]?.executable,
      savingsMintExists: !!accounts[1],
      bondMintExists: !!accounts[2],
    });
    return;
  }
  if (command === 'init') {
    const program = await connection.getAccountInfo(DEFAULT_PROGRAM_ID);
    if (!program?.executable) throw new Error('Deploy the program first: npm run devnet:deploy');
    for (const mint of [savings, bond]) {
      if (!(await connection.getAccountInfo(mint.publicKey)))
        await createMint(connection, deployer, deployer.publicKey, null, 6, mint);
      const info = await getMint(connection, mint.publicKey);
      if (
        info.decimals !== 6 ||
        !info.mintAuthority?.equals(deployer.publicKey) ||
        info.freezeAuthority !== null
      )
        throw new Error('Unexpected test mint configuration.');
    }
    writeConfig();
    console.log('Devnet test mints are ready. Rebuild the app to load the configuration.');
    return;
  }
  if (command === 'fund') {
    if (!process.argv[3]) throw new Error('Usage: npm run devnet:fund -- <wallet-public-address>');
    const owner = new PublicKey(process.argv[3]);
    for (const mint of [savings, bond]) {
      const info = await getMint(connection, mint.publicKey);
      if (!info.mintAuthority?.equals(deployer.publicKey))
        throw new Error('Unexpected mint authority.');
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        deployer,
        mint.publicKey,
        owner,
      );
      const signature = await mintTo(
        connection,
        deployer,
        mint.publicKey,
        ata.address,
        deployer,
        1_000_000_000n,
      );
      console.log(`Minted 1,000 test tokens: ${signature}`);
    }
    console.log(
      'Test tokens funded. The wallet also needs a little devnet SOL for transaction fees and account rent.',
    );
    return;
  }
  throw new Error('Supported commands: prepare, status, init, fund');
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

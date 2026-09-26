import fs from 'node:fs';
import { Keypair } from '@solana/web3.js';

fs.mkdirSync('.local', { recursive: true });
const path = '.local/round-program-keypair.json';
const keypair = fs.existsSync(path)
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, 'utf8'))))
  : Keypair.generate();
if (!fs.existsSync(path))
  fs.writeFileSync(path, JSON.stringify([...keypair.secretKey]), { mode: 0o600 });
const id = keypair.publicKey.toBase58();
const programFile = 'programs/round/src/lib.rs';
const source = fs.readFileSync(programFile, 'utf8');
const oldId = source.match(/declare_id!\("([^"]+)"\)/)?.[1];
if (!oldId) throw new Error('Cannot find declared program address.');
for (const file of [programFile, 'Anchor.toml']) {
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(oldId, id));
}
fs.mkdirSync('target/deploy', { recursive: true });
fs.copyFileSync(path, 'target/deploy/round-keypair.json');
fs.chmodSync('target/deploy/round-keypair.json', 0o600);
console.log(`ROUND program: ${id}`);

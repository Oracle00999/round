export type Network = 'devnet' | 'mainnet-beta';
export const MAINNET_MINTS = {
  savings: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  bond: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
};
export const GENESIS = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
};
export function parseNetwork(value: string | undefined): Network {
  if (!value || value === 'devnet') return 'devnet';
  if (value === 'mainnet-beta') return value;
  throw new Error('Invalid ROUND network configuration.');
}
export const NETWORK = parseNetwork(process.env.EXPO_PUBLIC_SOLANA_NETWORK);
export const IS_MAINNET = NETWORK === 'mainnet-beta';
export const NETWORK_LABEL = IS_MAINNET ? 'Mainnet' : 'Devnet';
export const WALLET_CHAIN = IS_MAINNET ? 'solana:mainnet' : 'solana:devnet';
export const NETWORK_DESCRIPTION = IS_MAINNET
  ? 'Solana mainnet · Real USDC and SKR'
  : 'Solana devnet · Test tokens have no monetary value';
export const RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
  (IS_MAINNET ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
export const explorerTransaction = (signature: string) =>
  `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${IS_MAINNET ? '' : '?cluster=devnet'}`;

import { UserFacingError } from '../services/errors';
export function invitationLink(id: string, network: 'demo' | 'devnet' | 'mainnet-beta') {
  return `round://join/${encodeURIComponent(id)}?network=${network}`;
}
export function parseInvitation(value: string): {
  id: string;
  network?: 'demo' | 'devnet' | 'mainnet-beta';
} {
  const input = value.trim();
  if (/^[a-zA-Z0-9-]+$/.test(input)) return { id: input };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UserFacingError('Enter a ROUND invitation link or code.');
  }
  if (
    url.protocol !== 'round:' ||
    url.hostname !== 'join' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new UserFacingError('This is not a ROUND invitation.');
  const id = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new UserFacingError('The invitation code is invalid.');
  const network = url.searchParams.get('network');
  if (network !== null && network !== 'demo' && network !== 'devnet' && network !== 'mainnet-beta')
    throw new UserFacingError('This invitation uses an unsupported network.');
  return { id, network: network ?? undefined };
}

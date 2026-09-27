import type { ConnectionConfig } from '@solana/web3.js';

/** Pace expensive scans across callers; let the refresh loop handle rate-limit retries. */
export function pacedRpcFetch(
  transport: NonNullable<ConnectionConfig['fetch']>,
): NonNullable<ConnectionConfig['fetch']> {
  let nextRequest = 0;
  let nextScan = 0;
  return async (url, options) => {
    let method = '';
    try {
      method = JSON.parse(String(options?.body ?? '{}')).method;
    } catch {
      /* Not JSON RPC. */
    }
    const now = Date.now();
    const start = Math.max(now, nextRequest, method === 'getProgramAccounts' ? nextScan : 0);
    nextRequest = start + 120;
    if (method === 'getProgramAccounts') nextScan = start + 1100;
    if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      return await transport(url, { ...options, signal: options?.signal ?? controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

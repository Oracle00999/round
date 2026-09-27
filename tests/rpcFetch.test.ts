import { afterEach, expect, it, vi } from 'vitest';
import { pacedRpcFetch } from '../src/chain/rpcFetch';
afterEach(() => vi.useRealTimers());
it('spaces concurrent program scans without repeating failed requests', async () => {
  vi.useFakeTimers();
  const transport = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
  const fetch = pacedRpcFetch(transport);
  const options = { body: JSON.stringify({ method: 'getProgramAccounts' }) };
  const first = fetch('https://example.test', options);
  const second = fetch('https://example.test', options);
  expect(transport).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1099);
  expect(transport).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(transport).toHaveBeenCalledTimes(2);
  await Promise.all([first, second]);
  expect(vi.getTimerCount()).toBe(0);
});

import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { ensureBufferSubarray } from '../src/bufferCompatibility';
const require = createRequire(import.meta.url);
// Trailing slash selects the npm/mobile Buffer, not Node's built-in Buffer.
const MobileBuffer = require('buffer/').Buffer;
it('preserves numeric reads and shared memory on mobile Buffer subarrays', () => {
  // Model Hermes returning a Uint8Array view from inherited subarray.
  MobileBuffer.prototype.subarray = function(start?: number, end?: number) {
    return new Uint8Array(this.buffer, this.byteOffset, this.byteLength).subarray(start, end);
  };
  const input = MobileBuffer.alloc(16);
  input.writeUIntLE(42, 8, 4);
  expect(typeof input.subarray(8).readUIntLE).toBe('undefined');
  ensureBufferSubarray(MobileBuffer);
  const body = input.subarray(8);
  expect(body.readUIntLE(0, 4)).toBe(42);
  body[0] = 7;
  expect(input[8]).toBe(7);
  expect(MobileBuffer.isBuffer(body.subarray(1))).toBe(true);
  expect(input.subarray(-2).length).toBe(2);
  expect(input.subarray(8, 4).length).toBe(0);
});

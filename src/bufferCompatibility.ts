import { Buffer } from 'buffer';

/** Anchor uses Buffer.subarray(), whose result must retain Buffer read methods.
 * The browser Buffer implementation can inherit Uint8Array.subarray on Hermes.
 * Preserve its shared-memory view while restoring the Buffer API. */
export function ensureBufferSubarray(BufferClass: typeof Buffer) {
  if (BufferClass.isBuffer(BufferClass.alloc(1).subarray(0))) return;
  BufferClass.prototype.subarray = function (start?: number, end?: number) {
    const view = Uint8Array.prototype.subarray.call(this, start, end);
    return BufferClass.from(view.buffer, view.byteOffset, view.byteLength);
  };
}

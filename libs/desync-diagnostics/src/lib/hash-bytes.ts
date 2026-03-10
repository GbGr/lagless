/**
 * Polynomial hash (same algorithm as Mem.getHash) but using direct Uint8Array indexing
 * instead of DataView for better performance on large buffers (e.g. Rapier snapshots).
 */
export function hashBytes(data: Uint8Array): number {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 31 + data[i]) >>> 0;
  }
  return hash;
}

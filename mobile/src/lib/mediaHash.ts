import { sha256 } from "@noble/hashes/sha2.js";

export const HASH_CHUNK_SIZE = 4 * 1024 * 1024;

export async function sha256ByRanges(
  byteSize: number,
  readRange: (start: number, end: number) => Promise<Uint8Array>,
  chunkSize = HASH_CHUNK_SIZE,
): Promise<string> {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) throw new Error("byteSize must be positive");
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new Error("chunkSize must be positive");
  const hash = sha256.create();
  for (let start = 0; start < byteSize; start += chunkSize) {
    const end = Math.min(byteSize, start + chunkSize);
    const bytes = await readRange(start, end);
    if (bytes.byteLength !== end - start) throw new Error("Could not read the complete video while hashing");
    hash.update(bytes);
  }
  return [...hash.digest()].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

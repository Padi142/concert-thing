const QUICKTIME_EPOCH_SECONDS = 2_082_844_800;
export const TIMESTAMP_SCAN_BYTES = 4 * 1024 * 1024;

function isoDate(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function capturedAtFromMetadata(input: {
  creationTimeMs?: number | null;
  modificationTimeMs?: number | null;
  fileModificationTimeSeconds?: number | null;
}): string | null {
  return isoDate(input.creationTimeMs)
    ?? isoDate(input.modificationTimeMs)
    ?? isoDate(typeof input.fileModificationTimeSeconds === "number" ? input.fileModificationTimeSeconds * 1000 : null);
}

export function parseMp4CreationTime(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index <= bytes.length - 16; index += 1) {
    if (bytes[index] !== 0x6d || bytes[index + 1] !== 0x76 || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64) continue;
    const version = bytes[index + 4];
    const seconds = version === 0
      ? view.getUint32(index + 8)
      : version === 1 && index <= bytes.length - 20 ? Number(view.getBigUint64(index + 8)) : 0;
    const milliseconds = (seconds - QUICKTIME_EPOCH_SECONDS) * 1000;
    if (milliseconds >= Date.UTC(1990, 0, 1) && milliseconds <= Date.now() + 86_400_000) return new Date(milliseconds).toISOString();
  }
  return null;
}

export async function embeddedVideoTimestamp(
  byteSize: number,
  readRange: (start: number, end: number) => Promise<Uint8Array>,
  scanBytes = TIMESTAMP_SCAN_BYTES,
): Promise<string | null> {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) return null;
  const headEnd = Math.min(byteSize, scanBytes);
  const headTimestamp = parseMp4CreationTime(await readRange(0, headEnd));
  if (headTimestamp || byteSize <= scanBytes) return headTimestamp;
  return parseMp4CreationTime(await readRange(Math.max(0, byteSize - scanBytes), byteSize));
}

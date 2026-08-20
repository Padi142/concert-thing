const QUICKTIME_EPOCH_SECONDS = 2_082_844_800;
const SCAN_BYTES = 4 * 1024 * 1024;

export type MediaTimestamp = { capturedAt: string | null; source: "embedded_metadata" | "file_modified" | null };

export function parseMp4CreationTime(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let index = 0; index <= bytes.length - 16; index++) {
    if (bytes[index] !== 0x6d || bytes[index + 1] !== 0x76 || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64) continue;
    const version = bytes[index + 4];
    const seconds = version === 0
      ? view.getUint32(index + 8)
      : version === 1 && index <= bytes.length - 20 ? Number(view.getBigUint64(index + 8)) : 0;
    const milliseconds = (seconds - QUICKTIME_EPOCH_SECONDS) * 1000;
    const earliestReasonableDate = Date.UTC(1990, 0, 1);
    if (milliseconds >= earliestReasonableDate && milliseconds <= Date.now() + 86_400_000) return new Date(milliseconds).toISOString();
  }
  return null;
}

export async function mediaTimestamp(file: File): Promise<MediaTimestamp> {
  if (file.type === "video/mp4" || file.type === "video/quicktime") {
    const head = await file.slice(0, Math.min(file.size, SCAN_BYTES)).arrayBuffer();
    let capturedAt = parseMp4CreationTime(head);
    if (!capturedAt && file.size > SCAN_BYTES) {
      const tail = await file.slice(Math.max(0, file.size - SCAN_BYTES)).arrayBuffer();
      capturedAt = parseMp4CreationTime(tail);
    }
    if (capturedAt) return { capturedAt, source: "embedded_metadata" };
  }
  return file.lastModified > 0
    ? { capturedAt: new Date(file.lastModified).toISOString(), source: "file_modified" }
    : { capturedAt: null, source: null };
}

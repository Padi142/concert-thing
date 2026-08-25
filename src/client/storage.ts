export type StorageSnapshot = {
  effectiveQuotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
  overQuota: boolean;
  plan: { key: string; name: string };
};

const DECIMAL_GB = 1_000_000_000;
const DECIMAL_MB = 1_000_000;

/** Format plan storage in the decimal units used by the product. */
export function formatStorageBytes(bytes: number): string {
  const value = Math.max(0, bytes);
  if (value >= DECIMAL_GB) {
    const gigabytes = value / DECIMAL_GB;
    return `${gigabytes >= 10 || Number.isInteger(gigabytes) ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} GB`;
  }
  if (value >= DECIMAL_MB) return `${Math.round(value / DECIMAL_MB)} MB`;
  if (value === 0) return "0 GB";
  return `${Math.max(1, Math.round(value / 1_000))} KB`;
}

export function storageQuotaError(data: Record<string, unknown>): { required: string; available: string } | null {
  if (data.code !== "STORAGE_QUOTA_EXCEEDED") return null;
  if (typeof data.requiredBytes !== "number" || typeof data.availableBytes !== "number") return null;
  return {
    required: formatStorageBytes(data.requiredBytes),
    available: formatStorageBytes(data.availableBytes),
  };
}

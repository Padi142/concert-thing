import React from "react";
import { Database, LoaderCircle } from "lucide-react";
import { formatStorageBytes, type StorageSnapshot } from "../storage";

export default function StorageMeter({ storage, loading = false }: { storage: StorageSnapshot | null; loading?: boolean }) {
  if (!storage) {
    return <div className="storage-meter storage-meter-loading" aria-live="polite">
      <LoaderCircle size={17} className={loading ? "animate-spin" : ""} />
      <span>{loading ? "Reading storage…" : "Storage unavailable"}</span>
    </div>;
  }

  const quota = Math.max(1, storage.effectiveQuotaBytes);
  const usedPercent = Math.min(100, storage.usedBytes / quota * 100);
  const reservedPercent = Math.min(100 - usedPercent, storage.reservedBytes / quota * 100);
  const occupied = storage.usedBytes + storage.reservedBytes;
  const status = storage.overQuota
    ? "Uploads are paused until space is available"
    : storage.reservedBytes > 0
      ? `${formatStorageBytes(storage.reservedBytes)} held for uploads in progress`
      : `${formatStorageBytes(storage.availableBytes)} available`;

  return <section className={`storage-meter ${storage.overQuota ? "storage-meter-over" : ""}`} aria-label="Storage allowance">
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="storage-meter-icon"><Database size={18} /></span>
        <div className="min-w-0">
          <div className="eyebrow !mb-0">{storage.plan.name} plan</div>
          <div className="mt-0.5 font-display text-xl leading-6">
            {formatStorageBytes(storage.usedBytes)} <span className="text-sm font-sans font-medium text-muted">of {formatStorageBytes(storage.effectiveQuotaBytes)}</span>
          </div>
        </div>
      </div>
      <span className="shrink-0 text-right text-xs font-semibold text-muted">{Math.round(Math.min(100, occupied / quota * 100))}%</span>
    </div>
    <div className="storage-meter-track" role="progressbar" aria-label="Storage used and reserved" aria-valuemin={0} aria-valuemax={storage.effectiveQuotaBytes} aria-valuenow={Math.min(occupied, storage.effectiveQuotaBytes)}>
      <span className="storage-meter-used" style={{ width: `${usedPercent}%` }} />
      <span className="storage-meter-reserved" style={{ left: `${usedPercent}%`, width: `${reservedPercent}%` }} />
    </div>
    <p className={`mt-2 text-[13px] leading-snug ${storage.overQuota ? "text-danger" : "text-muted"}`}>{status}</p>
  </section>;
}

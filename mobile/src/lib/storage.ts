import { getStorage } from "./api";
import { getCurrentUserId } from "./clerk";
import type { StorageSnapshot } from "../types";

type Listener = (storage: StorageSnapshot | null) => void;
const listeners = new Set<Listener>();
let currentAccountId: string | null = null;
let pending: { accountId: string | null; request: Promise<StorageSnapshot> } | null = null;

function emit(storage: StorageSnapshot | null): void {
  for (const listener of listeners) listener(storage);
}

export function formatStorageBytes(bytes: number): string {
  const value = Math.max(0, bytes);
  if (value >= 1_000_000_000) {
    const gigabytes = value / 1_000_000_000;
    return `${gigabytes >= 10 || Number.isInteger(gigabytes) ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} GB`;
  }
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} MB`;
  if (value === 0) return "0 GB";
  return `${Math.max(1, Math.round(value / 1_000))} KB`;
}

export function subscribeStorage(listener: Listener): () => void {
  listeners.add(listener);
  listener(null);
  return () => listeners.delete(listener);
}

export async function refreshStorage(): Promise<StorageSnapshot> {
  const accountId = await getCurrentUserId();
  if (accountId !== currentAccountId) {
    currentAccountId = accountId;
    emit(null);
  }
  if (pending?.accountId === accountId) return pending.request;

  const request = (async () => {
    const storage = await getStorage();
    if (await getCurrentUserId() === accountId) {
      emit(storage);
    }
    return storage;
  })();
  pending = { accountId, request };
  try {
    return await request;
  } finally {
    if (pending?.request === request) pending = null;
  }
}

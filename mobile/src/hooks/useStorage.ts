import { useCallback, useEffect, useState } from "react";
import { refreshStorage, subscribeStorage } from "../lib/storage";
import type { StorageSnapshot } from "../types";

export function useStorage(): { storage: StorageSnapshot | null; loading: boolean; refresh: () => Promise<void> } {
  const [storage, setStorage] = useState<StorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubscribe = subscribeStorage(setStorage);
    let active = true;
    void refreshStorage()
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshStorage();
    } finally {
      setLoading(false);
    }
  }, []);
  return { storage, loading, refresh };
}

import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatStorageBytes } from "../lib/storage";
import { useThemeTokens } from "../theme/tokens";
import type { StorageSnapshot } from "../types";

export function StorageMeter({ storage, compact = false, loading = false }: { storage: StorageSnapshot | null; compact?: boolean; loading?: boolean }) {
  const tokens = useThemeTokens();
  if (!storage) return <View className="mx-5 rounded-[14px] border border-control bg-surface px-4 py-4"><Text className="font-sans text-[14px] text-muted">{loading ? "Reading storage…" : "Storage unavailable"}</Text></View>;
  const quota = Math.max(1, storage.effectiveQuotaBytes);
  const usedPercent = Math.min(100, storage.usedBytes / quota * 100);
  const reservedPercent = Math.min(100 - usedPercent, storage.reservedBytes / quota * 100);
  const occupiedPercent = Math.round(Math.min(100, (storage.usedBytes + storage.reservedBytes) / quota * 100));
  const status = storage.overQuota
    ? "Uploads paused until space is available"
    : storage.reservedBytes > 0
      ? `${formatStorageBytes(storage.reservedBytes)} reserved for uploads`
      : `${formatStorageBytes(storage.availableBytes)} available`;
  return <View className={`mx-5 overflow-hidden rounded-[14px] border bg-surface ${compact ? "px-4 py-3" : "px-4 py-4"}`} style={{ borderColor: storage.overQuota ? tokens.colors.danger : tokens.colors.controlLine }}>
    <View className="flex-row items-center justify-between">
      <View className="min-w-0 flex-1 flex-row items-center">
        <View className="mr-3 h-9 w-9 items-center justify-center rounded-[9px] bg-blueSoft"><Ionicons name="server-outline" size={18} color={tokens.colors.accent} /></View>
        <View className="min-w-0 flex-1"><Text className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-muted">{storage.plan.name} plan</Text><Text className="mt-0.5 font-display text-[20px] text-ink">{formatStorageBytes(storage.usedBytes)} <Text className="font-sans text-[13px] text-muted">of {formatStorageBytes(storage.effectiveQuotaBytes)}</Text></Text></View>
      </View>
      <Text className="font-sans text-[12px] font-semibold text-muted">{occupiedPercent}%</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: occupiedPercent }} className="mt-3 h-2 overflow-hidden rounded-full bg-line">
      <View className="absolute inset-y-0 left-0 bg-blue" style={{ width: `${usedPercent}%` }} />
      <View className="absolute inset-y-0 bg-blue" style={{ left: `${usedPercent}%`, width: `${reservedPercent}%`, opacity: 0.42 }} />
    </View>
    <Text className={`mt-2 font-sans text-[13px] ${storage.overQuota ? "text-danger" : "text-muted"}`}>{status}</Text>
  </View>;
}

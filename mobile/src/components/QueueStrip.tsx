import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeTokens } from "../theme/tokens";
import type { QueueUpload } from "../types";

export function QueueStrip({ uploads }: { uploads: QueueUpload[] }) {
  const tokens = useThemeTokens();
  const router = useRouter();
  const active = uploads.filter((upload) => upload.state === "uploading" || upload.state === "queued" || upload.state === "retrying");
  if (!active.length) return null;
  const progressLabel = active.length === 1 ? "1 item in upload queue" : `${active.length} items in upload queue`;
  return <Pressable accessibilityRole="button" accessibilityLabel="Open upload queue" onPress={() => router.push("/(tabs)/queue")} className="mx-5 mb-4 min-h-12 flex-row items-center border-y border-line bg-surface px-3">
    <View className="h-2 w-2 rounded-full bg-blue" />
    <Text className="ml-2 flex-1 font-sans text-[14px] font-semibold text-ink">{progressLabel}</Text>
    <Text className="mr-1 font-sans text-[14px] text-muted">View</Text>
    <Ionicons name="arrow-forward" size={16} color={tokens.colors.accent} />
  </Pressable>;
}

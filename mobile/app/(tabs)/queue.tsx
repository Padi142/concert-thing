import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useArchive } from "../../src/hooks/useArchive";
import { useQueue } from "../../src/hooks/useQueue";
import { EmptyState, ErrorLine, Heading, Hairline, IconButton, LoadingLine, PrimaryButton, QuietButton } from "../../src/components/ui";
import { Dialog, useDialog } from "../../src/components/Dialog";
import { useThemeTokens } from "../../src/theme/tokens";
import type { QueueState, QueueUpload } from "../../src/types";
import { StorageMeter } from "../../src/components/StorageMeter";
import { useStorage } from "../../src/hooks/useStorage";

/** Finished transfers linger briefly, then fade away. */
const DONE_LINGER_MS = 4_000;
const DONE_FADE_MS = 1_200;
const DONE_VISIBLE_MS = DONE_LINGER_MS + DONE_FADE_MS;

const STATE_RANK: Record<QueueState, number> = {
  uploading: 0,
  retrying: 1,
  blocked: 2,
  queued: 3,
  paused: 4,
  failed: 5,
  duplicate: 6,
  complete: 7,
  cancelled: 8,
};

function isDone(upload: QueueUpload): boolean {
  return upload.state === "complete" || upload.state === "duplicate";
}

function byteLabel(value: number): string {
  if (value > 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function stateLabel(upload: QueueUpload): string {
  if (upload.state === "uploading") return "Uploading in background";
  if (upload.state === "retrying") return "Waiting to retry";
  if (upload.state === "failed") return upload.last_error || "Upload failed";
  if (upload.state === "blocked") return upload.last_error || "Waiting for storage";
  if (upload.state === "complete") return "Uploaded";
  if (upload.state === "duplicate") return "Duplicate — already in archive";
  return "Waiting to upload";
}

function QueueRow({ upload, onCancel, onRetry }: { upload: QueueUpload; onCancel: () => void; onRetry: () => void }) {
  const tokens = useThemeTokens();
  const isDone = upload.state === "complete" || upload.state === "duplicate";
  const isDuplicate = upload.state === "duplicate";
  const totalParts = upload.total_parts ?? 0;
  const completedParts = upload.completed_parts ?? 0;
  const progress = isDone ? 100 : totalParts ? Math.round(completedParts / totalParts * 100) : 0;
  return <View className="mx-5 border-b border-line py-4">
    <View className="flex-row items-start"><View className={`mr-3 h-10 w-10 items-center justify-center rounded-[8px] ${upload.state === "complete" ? "bg-successSoft" : upload.state === "failed" ? "bg-dangerSoft" : "bg-blueSoft"}`}><Ionicons name={upload.state === "complete" ? "checkmark" : isDuplicate ? "copy-outline" : upload.state === "failed" ? "alert-outline" : "cloud-upload-outline"} size={19} color={upload.state === "complete" ? tokens.colors.success : upload.state === "failed" ? tokens.colors.danger : tokens.colors.accent} /></View><View className="min-w-0 flex-1"><Text numberOfLines={1} className="font-sans text-[16px] font-semibold text-ink">{upload.original_name}</Text><Text className="mt-1 font-sans text-[14px] text-muted">{byteLabel(upload.byte_size)} · {stateLabel(upload)}</Text>{totalParts ? <Text className="mt-1 font-sans text-[13px] text-subtle">{completedParts} of {totalParts} parts · {progress}%</Text> : null}</View>{!isDone ? <IconButton icon="close" label={`Cancel ${upload.original_name}`} onPress={onCancel} /> : null}</View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} className="mt-3 h-1 overflow-hidden rounded-full bg-line"><View className="h-full bg-blue" style={{ width: `${progress}%` }} /></View>
    {upload.state === "failed" || upload.state === "blocked" ? <View className="mt-2 flex-row justify-end"><QuietButton onPress={onRetry}>Retry</QuietButton></View> : null}
  </View>;
}

function FadingQueueRow({ upload, onGone, onCancel, onRetry }: { upload: QueueUpload; onGone: (id: string) => void; onCancel: () => void; onRetry: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isDone(upload)) return;
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: DONE_FADE_MS, useNativeDriver: true }).start(() => onGone(upload.id));
    }, DONE_LINGER_MS);
    return () => clearTimeout(timer);
  }, [upload.state, opacity, onGone, upload.id]);
  return <Animated.View style={{ opacity }}><QueueRow upload={upload} onCancel={onCancel} onRetry={onRetry} /></Animated.View>;
}

export default function QueueScreen() {
  const tokens = useThemeTokens();
  const { uploads, refresh, resume, cancel, retry } = useQueue();
  const { storage, loading: storageLoading, refresh: refreshStorage } = useStorage();
  const { media } = useArchive();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const dialog = useDialog();
  const libraryStats = useMemo(() => ({ count: media.length, bytes: media.reduce((total, item) => total + item.byte_size, 0) }), [media]);
  // Finished rows that already outlived their linger window (e.g. from a
  // previous session) are dropped outright; the rest fade out in place.
  const visible = useMemo(() => {
    const now = Date.now();
    return uploads
      .filter((upload) => !gone.has(upload.id) && (!isDone(upload) || now - upload.updated_at < DONE_VISIBLE_MS))
      .sort((left, right) => STATE_RANK[left.state] - STATE_RANK[right.state] || left.created_at - right.created_at);
  }, [uploads, gone]);
  const active = useMemo(() => uploads.filter((upload) => upload.state === "uploading" || upload.state === "retrying" || upload.state === "queued"), [uploads]);
  const onGone = (id: string) => setGone((previous) => new Set(previous).add(id));
  async function resumeNow() {
    setBusy(true);
    await resume().catch(() => undefined);
    setBusy(false);
  }
  return <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([refresh(), refreshStorage()]); setRefreshing(false); }} tintColor={tokens.colors.accent} />} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
      <Heading action={<IconButton icon="refresh" label="Resume upload queue" onPress={() => void resumeNow()} tone="accent" />}>Upload queue</Heading>
      <StorageMeter storage={storage} compact loading={storageLoading} />
      <View className="mx-5 mb-5 mt-4 flex-row gap-3">
        <View className="flex-1 rounded-[12px] border border-control bg-surface px-4 py-3">
          <Text className="font-display text-[22px] leading-[26px] text-ink">{libraryStats.count}</Text>
          <Text className="mt-0.5 font-sans text-[13px] text-muted">Media uploaded</Text>
        </View>
        <View className="flex-1 rounded-[12px] border border-control bg-surface px-4 py-3">
          <Text className="font-display text-[22px] leading-[26px] text-ink">{libraryStats.bytes ? byteLabel(libraryStats.bytes) : "0 KB"}</Text>
          <Text className="mt-0.5 font-sans text-[13px] text-muted">Library size</Text>
        </View>
      </View>
      {busy ? <LoadingLine label="Resuming uploads" /> : null}
      {!visible.length ? <EmptyState icon="cloud-upload-outline" title="Queue is empty" detail="Add media from Library. The upload queue is stored on-device and resumes when the app opens." /> : null}
      {visible.length ? <>
        <View className="mx-5 mb-2 flex-row items-center justify-between"><Text className="font-display text-[20px] text-ink">Transfers</Text><Text className="font-sans text-[13px] text-muted">{active.length} active</Text></View>
        <Hairline className="mx-5" />
        {visible.map((upload) => <FadingQueueRow key={upload.id} upload={upload} onGone={onGone} onCancel={() => dialog.show("Cancel upload?", "The local copy will be removed from this queue.", [{ label: "Cancel upload", tone: "danger", onPress: () => void cancel(upload.id) }, { label: "Keep", tone: "quiet" }])} onRetry={() => void retry(upload.id)} />)}
      </> : null}
    </ScrollView>
    <Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} />
  </SafeAreaView>;
}

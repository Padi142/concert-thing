import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { assignMedia, createShow, getMedia } from "../../src/lib/api";
import { videosForEventSync } from "../../src/lib/eventSync";
import { useThemeTokens } from "../../src/theme/tokens";
import { Hairline, PrimaryButton } from "../../src/components/ui";
import { Dialog, useDialog } from "../../src/components/Dialog";
import type { MediaItem } from "../../src/types";

function Field({ label, value, onChangeText, placeholder, keyboardType = "default", multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "email-address" | "numbers-and-punctuation"; multiline?: boolean }) {
  const tokens = useThemeTokens();
  return <View className="mb-4"><Text className="mb-2 font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={tokens.colors.subtle} keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} className={`min-h-12 rounded-[10px] border border-control bg-surface px-3 py-3 font-sans text-[16px] text-ink ${multiline ? "min-h-[80px]" : ""}`} /></View>;
}

/** Concerts usually run past midnight: anchor the event day, then default to 17:00 → 04:00 next morning. */
function eventWindow(capturedAt: string | undefined): { startsAt: Date; endsAt: Date } {
  const captured = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  const anchor = Number.isFinite(captured) ? new Date(captured) : new Date();
  // A capture in the small hours still belongs to the previous evening's show.
  if (anchor.getHours() < 5) anchor.setDate(anchor.getDate() - 1);
  const dayStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).getTime();
  return { startsAt: new Date(dayStart + 17 * 60 * 60 * 1000), endsAt: new Date(dayStart + 28 * 60 * 60 * 1000) };
}

function initialEventDate(capturedAt: string | undefined, field: "start" | "end"): Date {
  const window = eventWindow(capturedAt);
  return field === "start" ? window.startsAt : window.endsAt;
}

/** End-time presets, counted in hours from the start day's midnight (24 = midnight, 28 = 4 AM next day). */
const END_PRESETS = [
  { label: "Midnight", offsetHours: 24 },
  { label: "2 AM", offsetHours: 26 },
  { label: "3 AM", offsetHours: 27 },
  { label: "4 AM", offsetHours: 28 },
  { label: "6 AM", offsetHours: 30 },
];

export default function NewShowScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const { sourceMediaId, capturedAt } = useLocalSearchParams<{ sourceMediaId?: string; capturedAt?: string }>();
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [locality, setLocality] = useState("");
  const [startsAt, setStartsAt] = useState(() => initialEventDate(capturedAt, "start"));
  const [endsAt, setEndsAt] = useState(() => initialEventDate(capturedAt, "end"));
  const [picker, setPicker] = useState<{ field: "start" | "end"; mode: "date" | "time" | "datetime" } | null>(null);
  const [endTouched, setEndTouched] = useState(false);
  const [artists, setArtists] = useState("");
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [syncNearby, setSyncNearby] = useState(true);
  const dialog = useDialog();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  useEffect(() => {
    let cancelled = false;
    void getMedia()
      .then((items) => { if (!cancelled) { setMedia(items); setMediaError(false); } })
      .catch(() => { if (!cancelled) setMediaError(true); })
      .finally(() => { if (!cancelled) setMediaLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const syncCandidates = useMemo(
    () => videosForEventSync(media, startsAt, endsAt, sourceMediaId),
    [endsAt, media, sourceMediaId, startsAt],
  );
  const sourceVideo = sourceMediaId ? syncCandidates.find((item) => item.id === sourceMediaId) : undefined;
  const nearbyVideos = sourceMediaId ? syncCandidates.filter((item) => item.id !== sourceMediaId) : syncCandidates;
  const videosToAssign = useMemo(
    () => [...(sourceVideo ? [sourceVideo] : []), ...(syncNearby ? nearbyVideos : [])],
    [nearbyVideos, sourceVideo, syncNearby],
  );
  const assignmentIds = useMemo(
    () => [...new Set([sourceMediaId, ...videosToAssign.map((item) => item.id)].filter((value): value is string => Boolean(value)))],
    [sourceMediaId, videosToAssign],
  );
  async function save() {
    if (!title.trim() || !venue.trim()) { dialog.show("Missing details", "Add a title and venue."); return; }
    if (endsAt.getTime() <= startsAt.getTime()) { dialog.show("Check the event times", "The end must be after the start."); return; }
    setBusy(true);
    try {
      const show = await createShow({ title: title.trim(), venue: venue.trim(), locality: locality.trim(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone, artists: artists.split(",").map((artist) => artist.trim()).filter(Boolean) });
      const assignments = await Promise.allSettled(assignmentIds.map((mediaId) => assignMedia(mediaId, show.id)));
      const failed = assignments.filter((result) => result.status === "rejected").length;
      if (failed) {
        dialog.show(
          "Show created",
          `${assignmentIds.length - failed} videos were synced. ${failed} could not be assigned and remain in Unassigned videos.`,
          [{ label: "Open show", onPress: () => router.replace(`/show/${show.id}`) }],
        );
      } else {
        router.replace(`/show/${show.id}`);
      }
    } catch (cause) {
      dialog.show("Could not create show", cause instanceof Error ? cause.message : "Try again.");
    } finally { setBusy(false); }
  }
  function selectDate(event: DateTimePickerEvent, value?: Date) {
    if (event.type === "dismissed" || !value || !picker) { setPicker(null); return; }
    const previous = picker.field === "start" ? startsAt : endsAt;
    const next = new Date(previous);
    if (picker.mode === "date") next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    else if (picker.mode === "time") next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    else next.setTime(value.getTime());
    if (Platform.OS === "android" && picker.mode === "date") {
      setPicker({ field: picker.field, mode: "time" });
    } else {
      setPicker(null);
    }
    if (picker.field === "start") {
      setStartsAt(next);
      if (!endTouched) setEndsAt(new Date(next.getTime() + 4 * 60 * 60 * 1000));
    } else { setEndsAt(next); setEndTouched(true); }
  }
  return <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-canvas">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
        <View className="mb-6 flex-row items-center px-5"><Pressable accessibilityRole="button" accessibilityLabel="Close new show" onPress={() => router.back()} className="mr-3 h-12 w-12 items-center justify-center"><Ionicons name="close" size={25} color={tokens.colors.ink} /></Pressable><View><Text className="font-display text-[28px] text-ink">New show</Text>{sourceMediaId ? <Text className="mt-0.5 font-sans text-[13px] text-blue">Creating from video</Text> : null}</View></View>
        <Hairline className="mb-5" />
        <View className="px-5"><Field label="Title" value={title} onChangeText={setTitle} placeholder="Artist or event name" /><Field label="Venue" value={venue} onChangeText={setVenue} placeholder="Where did you see it?" /><Field label="City or locality" value={locality} onChangeText={setLocality} placeholder="Optional" /><Pressable accessibilityRole="button" accessibilityLabel="Choose start date and time" onPress={() => setPicker({ field: "start", mode: Platform.OS === "ios" ? "datetime" : "date" })} className="mb-4"><Text className="mb-2 font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">Start time</Text><View className="min-h-12 justify-center rounded-[10px] border border-control bg-surface px-3"><Text className="font-sans text-[16px] text-ink">{startsAt.toLocaleString()}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Choose end date and time" onPress={() => setPicker({ field: "end", mode: Platform.OS === "ios" ? "datetime" : "date" })} className="mb-4"><Text className="mb-2 font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">End time</Text><View className="min-h-12 justify-center rounded-[10px] border border-control bg-surface px-3"><Text className="font-sans text-[16px] text-ink">{endsAt.toLocaleString()}</Text></View></Pressable><Field label="Artists" value={artists} onChangeText={setArtists} placeholder="Comma-separated (optional)" />
          <View className="mb-5 overflow-hidden rounded-[14px] border border-line bg-surface">
            <View className="flex-row items-center px-4 py-4">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-blueSoft"><Ionicons name="sync" size={20} color={tokens.colors.accent} /></View>
              <View className="ml-3 min-w-0 flex-1">
                <Text className="font-sans text-[16px] font-semibold text-ink">Video sync</Text>
                <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-muted">{mediaLoading ? "Checking unassigned videos…" : mediaError ? "Preview unavailable — the show can still be created." : `${assignmentIds.length} ${assignmentIds.length === 1 ? "video" : "videos"} will be added`}</Text>
              </View>
              {nearbyVideos.length ? <Switch accessibilityLabel="Sync videos inside this show time" accessibilityRole="switch" hitSlop={8} value={syncNearby} onValueChange={setSyncNearby} trackColor={{ false: tokens.colors.line, true: tokens.colors.accent }} thumbColor={tokens.colors.mediaInk} /> : null}
            </View>
            {!mediaLoading && !mediaError ? <><Hairline />{sourceVideo ? <View className="flex-row items-center px-4 py-3"><Ionicons name="checkmark-circle" size={18} color={tokens.colors.success} /><View className="ml-3 min-w-0 flex-1"><Text numberOfLines={1} className="font-sans text-[14px] font-semibold text-ink">{sourceVideo.original_name}</Text><Text className="mt-0.5 font-sans text-[12px] text-muted">Current video · always included</Text></View></View> : null}{syncNearby ? nearbyVideos.map((video) => <View key={video.id} className="flex-row items-center border-t border-line px-4 py-3"><Ionicons name="videocam-outline" size={18} color={tokens.colors.muted} /><View className="ml-3 min-w-0 flex-1"><Text numberOfLines={1} className="font-sans text-[14px] text-ink">{video.original_name}</Text><Text className="mt-0.5 font-sans text-[12px] text-muted">{video.captured_at ? new Date(video.captured_at).toLocaleString() : "Capture time unavailable"}</Text></View></View>) : null}{!sourceVideo && !nearbyVideos.length ? <Text className="px-4 py-4 font-sans text-[13px] leading-[18px] text-muted">No unassigned videos fall inside this time window. Change the times to refresh the preview.</Text> : null}</> : null}
          </View>
          <Text className="mb-5 font-sans text-[13px] leading-5 text-muted">Future uploads inside this event window will continue to assign automatically. Times use {timezone}.</Text><PrimaryButton onPress={() => void save()} disabled={busy || !title.trim() || !venue.trim() || endsAt.getTime() <= startsAt.getTime()}>{busy ? (videosToAssign.length ? "Creating and syncing…" : "Creating…") : videosToAssign.length ? `Create show + add ${videosToAssign.length}` : "Create show"}</PrimaryButton></View>
      </ScrollView>
    </KeyboardAvoidingView>
    {picker ? <DateTimePicker value={picker.field === "start" ? startsAt : endsAt} mode={picker.mode} onChange={selectDate} /> : null}
    <Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} />
  </SafeAreaView>;
}

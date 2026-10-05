import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useArchive } from "../../src/hooks/useArchive";
import { useRecognition } from "../../src/hooks/useRecognition";
import { addManualSongMatch, deleteMedia, deleteSongMatch, reviewSongMatch } from "../../src/lib/api";
import { enqueueRecognition } from "../../src/lib/recognitionQueue";
import { AssignmentSheet } from "../../src/components/AssignmentSheet";
import { Dialog, DialogOption, useDialog } from "../../src/components/Dialog";
import { MediaPreview } from "../../src/components/MediaPreview";
import { shareVideoLink } from "../../src/components/VideoShare";
import { ErrorLine, Hairline, IconButton, LoadingLine, PrimaryButton, QuietButton } from "../../src/components/ui";
import { useThemeTokens } from "../../src/theme/tokens";
import type { SongMatch } from "../../src/types";
import { refreshStorage } from "../../src/lib/storage";

function MatchEditor({ visible, title, artist, manual, heading, submitLabel, onClose, onSubmit }: { visible: boolean; title: string; artist: string; manual: boolean; heading: string; submitLabel: string; onClose: () => void; onSubmit: (title: string, artist: string, startSeconds: number) => Promise<void> }) {
  const tokens = useThemeTokens();
  const dialog = useDialog();
  const [nextTitle, setNextTitle] = useState(title);
  const [nextArtist, setNextArtist] = useState(artist);
  const [startSeconds, setStartSeconds] = useState("0");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNextTitle(title); setNextArtist(artist); setStartSeconds("0"); }, [title, artist, visible]);
  async function submit() {
    setSaving(true);
    try {
      await onSubmit(nextTitle.trim(), nextArtist.trim(), Math.max(0, Number(startSeconds) || 0));
    } catch (cause) {
      dialog.show("Could not save song", cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }
  return <><Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View className="flex-1 justify-end" style={{ backgroundColor: tokens.colors.scrim }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}><View className="rounded-t-[20px] bg-surface px-5 pb-8 pt-4"><View className="mb-5 flex-row items-center justify-between"><View><Text className="font-display text-[23px] text-ink">{heading}</Text><Text className="mt-1 font-sans text-[14px] text-muted">Saved songs appear on this video immediately.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close song editor" onPress={onClose} className="h-12 w-12 items-center justify-center"><Ionicons name="close" size={24} color={tokens.colors.ink} /></Pressable></View><Text className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-[1px] text-muted">Song title</Text><TextInput accessibilityLabel="Song title" value={nextTitle} onChangeText={setNextTitle} placeholder="What was playing?" placeholderTextColor={tokens.colors.subtle} className="mb-4 min-h-12 rounded-[10px] border border-control bg-surface px-3 font-sans text-[16px] text-ink" /><Text className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-[1px] text-muted">Artist</Text><TextInput accessibilityLabel="Artist" value={nextArtist} onChangeText={setNextArtist} placeholder="Who performed it?" placeholderTextColor={tokens.colors.subtle} className="mb-4 min-h-12 rounded-[10px] border border-control bg-surface px-3 font-sans text-[16px] text-ink" />{manual ? <><Text className="mb-2 font-sans text-[12px] font-semibold uppercase tracking-[1px] text-muted">Starts at · optional</Text><TextInput accessibilityLabel="Song start time in seconds" value={startSeconds} onChangeText={setStartSeconds} keyboardType="number-pad" placeholder="0 seconds" placeholderTextColor={tokens.colors.subtle} className="mb-5 min-h-12 rounded-[10px] border border-control bg-surface px-3 font-sans text-[16px] text-ink" /></> : <View className="mb-2" />}<PrimaryButton disabled={saving || !nextTitle.trim() || !nextArtist.trim()} onPress={() => void submit()}>{saving ? "Saving…" : submitLabel}</PrimaryButton></View></KeyboardAvoidingView></View></Modal><Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} /></>;
}

function MatchRow({ match, onConfirm, onDismiss, onEdit, onDelete }: { match: SongMatch; onConfirm: () => void; onDismiss: () => void; onEdit: () => void; onDelete: () => void }) {
  const tokens = useThemeTokens();
  const assigned = match.review_state === "confirmed" || match.review_state === "edited" || match.review_state === "manual";
  const stateLabel = match.review_state === "manual" ? "Added manually" : match.review_state === "edited" ? "Edited + added" : match.review_state === "confirmed" ? "Added" : "Suggested";
  return <View className="border-b border-line py-4">
    <View className="min-w-0">
      <Text numberOfLines={1} className="font-sans text-[16px] font-semibold text-ink">{match.title || match.candidate_title || "Unidentified song"}</Text>
      <Text numberOfLines={1} className="mt-0.5 font-sans text-[14px] text-muted">{match.artist || match.candidate_artist || "Artist unknown"}</Text>
      <View className="mt-2 flex-row items-center">
        <Ionicons name={assigned ? "checkmark-circle" : "sparkles-outline"} size={15} color={assigned ? tokens.colors.success : tokens.colors.accent} />
        <Text className={`ml-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.8px] ${assigned ? "text-success" : "text-blue"}`}>
          {stateLabel}{!assigned && match.confidence !== null ? ` · ${Math.round(match.confidence)}%` : ""}{match.start_ms > 0 ? ` · ${Math.round(match.start_ms / 1000)}s` : ""}
        </Text>
      </View>
    </View>
    <View className="mt-1 flex-row items-center justify-end">
      {assigned ? <>
        <QuietButton onPress={onEdit}>Edit</QuietButton>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${match.title}`} onPress={onDelete} className="ml-1 min-h-12 flex-row items-center px-3">
          <Ionicons name="trash-outline" size={17} color={tokens.colors.danger} />
          <Text className="ml-2 font-sans text-[15px] font-semibold text-danger">Remove</Text>
        </Pressable>
      </> : <>
        <QuietButton onPress={onDismiss}>Dismiss</QuietButton>
        <QuietButton onPress={onEdit}>Edit</QuietButton>
        <QuietButton onPress={onConfirm}>Add</QuietButton>
      </>}
    </View>
  </View>;
}

export default function MediaDetailScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shows, media, songMatches, loading, error, refresh, assignMedia } = useArchive();
  const item = media.find((candidate) => candidate.id === id);
  const recognitionEntry = useRecognition(id, item?.media_type === "video");
  const recognition = recognitionEntry?.status ?? null;
  const matches = useMemo(() => songMatches.filter((match) => match.media_id === id && match.review_state !== "rejected"), [songMatches, id]);
  const assignedMatches = useMemo(() => matches.filter((match) => match.review_state === "confirmed" || match.review_state === "edited" || match.review_state === "manual"), [matches]);
  const [assignVisible, setAssignVisible] = useState(false);
  const [editor, setEditor] = useState<{ match: SongMatch | null; manual: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useDialog();
  useEffect(() => {
    if (recognition === "completed") void refresh();
  }, [recognition, refresh]);
  async function confirmMatch(match: SongMatch) { await reviewSongMatch(match.id, "confirm"); await refresh(); }
  async function rejectMatch(match: SongMatch) { await reviewSongMatch(match.id, "reject"); await refresh(); }
  async function removeMatch(match: SongMatch) {
    try {
      await deleteSongMatch(match.id);
      await refresh();
    } catch (cause) {
      dialog.show("Could not remove song", cause instanceof Error ? cause.message : "Try again.");
    }
  }
  async function editMatch(title: string, artist: string, startSeconds: number) {
    if (!editor) return;
    if (editor.manual) await addManualSongMatch(id, title, artist, startSeconds * 1000);
    else if (editor.match) await reviewSongMatch(editor.match.id, "edit", { title, artist });
    setEditor(null);
    await refresh();
  }
  function startRecognition() {
    const rerun = recognition === "failed" || recognition === "no_match" || recognition === "completed";
    void enqueueRecognition(id, rerun);
  }
  function confirmDelete() {
    if (!item || deleting) return;
    dialog.show(
      "Delete this media?",
      "This permanently removes the original, its song data, and any Stream copy. This cannot be undone.",
      [
        {
          label: "Delete",
          tone: "danger",
          onPress: () => {
            setDeleting(true);
            void deleteMedia(item.id)
              .then(() => { void refreshStorage().catch(() => undefined); router.replace("/(tabs)/library"); })
              .catch((cause) => {
                setDeleting(false);
                dialog.show("Could not delete media", cause instanceof Error ? cause.message : "Try again.");
              });
          },
        },
        { label: "Cancel", tone: "quiet" },
      ],
    );
  }
  return <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
    <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
      <View className="mb-5 flex-row items-center px-5"><IconButton icon="arrow-back" label="Go back" onPress={() => router.back()} /><View className="ml-3 min-w-0 flex-1"><Text numberOfLines={1} className="font-display text-[22px] text-ink">{item?.original_name ?? "Media"}</Text></View>{item?.media_type === "video" ? <IconButton icon="ellipsis-horizontal" label="Video options" onPress={() => setMenuOpen(true)} /> : null}</View>
      <Hairline className="mb-4" />
      {!item && loading ? <LoadingLine label="Loading media" /> : null}
      {error ? <ErrorLine message={error} onRetry={refresh} /> : null}
      {item ? <>
        <View className="mx-5 overflow-hidden rounded-[12px] bg-line"><MediaPreview item={item} /></View>
        <View className="mt-4 px-5"><Text className="font-sans text-[15px] text-muted">{item.captured_at ? new Date(item.captured_at).toLocaleString() : "Capture time not available"}{item.duration_ms ? ` · ${Math.round(item.duration_ms / 1000)} sec` : ""}</Text><View className="mt-4 flex-row items-center"><View className="min-w-0 flex-1"><Text className="font-display text-[20px] text-ink">{item.show_title ?? "Unassigned videos"}</Text><Text className="mt-1 font-sans text-[14px] text-muted">{item.show_title ? "Assigned show" : "No show assigned"}</Text></View><QuietButton onPress={() => setAssignVisible(true)}>Change</QuietButton></View></View>
        {item.media_type === "video" ? <View className="mt-7 px-5">
          <View className="flex-row items-center justify-between">
            <View className="min-w-0 flex-1">
              <Text className="font-display text-[20px] text-ink">Songs in this video</Text>
              <Text className="mt-1 font-sans text-[14px] text-muted">
                {assignedMatches.length
                  ? `${assignedMatches.length} ${assignedMatches.length === 1 ? "song" : "songs"} added`
                  : matches.length
                    ? `${matches.length} ${matches.length === 1 ? "suggestion needs" : "suggestions need"} review`
                    : recognition === "queued" || recognition === "preparing" || recognition === "submitted" || recognition === "processing" ? "Listening for songs…" : "Nothing added yet"}
              </Text>
            </View>
            {assignedMatches.length < 2 ? <IconButton icon="add" label="Add a song manually" onPress={() => setEditor({ match: null, manual: true })} /> : null}
          </View>
          <View className="mt-4">
            {!assignedMatches.length && !matches.length && (recognition === null || recognition === "failed" || recognition === "no_match" || recognition === "completed")
              ? <PrimaryButton onPress={startRecognition} icon="musical-notes-outline">{recognition === null ? "Find songs" : "Try recognition again"}</PrimaryButton>
              : null}
            {recognitionEntry?.error ? <Text className="mt-3 font-sans text-[14px] text-danger">{recognitionEntry.error}</Text> : null}
            {!matches.length ? <View className="mt-5 border-l-2 border-blue py-1 pl-4">
              <Text className="font-sans text-[15px] font-semibold text-ink">No songs added</Text>
              <Text className="mt-1 font-sans text-[14px] leading-5 text-muted">Use recognition or add the title yourself. Added songs will be clearly marked here.</Text>
            </View> : matches.map((match) => <MatchRow key={match.id} match={match} onConfirm={() => void confirmMatch(match)} onDismiss={() => void rejectMatch(match)} onEdit={() => setEditor({ match, manual: false })} onDelete={() => void removeMatch(match)} />)}
          </View>
        </View> : null}
        <View className="mt-8 px-5">
          <Hairline className="mb-5" />
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.original_name}`} accessibilityState={{ disabled: deleting }} disabled={deleting} onPress={confirmDelete} className="min-h-12 flex-row items-center justify-center rounded-[10px] border border-danger px-4 active:opacity-60">
            <Ionicons name="trash-outline" size={18} color={tokens.colors.danger} />
            <Text className="ml-2 font-sans text-[16px] font-semibold text-danger">{deleting ? "Deleting…" : "Delete from archive"}</Text>
          </Pressable>
          <Text className="mt-2 text-center font-sans text-[13px] leading-5 text-muted">Permanently removes the original and related song data.</Text>
        </View>
      </> : null}
    </ScrollView>
    <AssignmentSheet visible={assignVisible} shows={shows} selectedId={item?.show_id ?? null} onClose={() => setAssignVisible(false)} onCreateNew={item && !item.show_id ? () => { setAssignVisible(false); router.push({ pathname: "/show/new", params: { sourceMediaId: item.id, capturedAt: item.captured_at ?? "" } }); } : undefined} onSelect={(showId) => { if (item) void assignMedia(item.id, showId).then(() => setAssignVisible(false)); }} />
    <Dialog visible={menuOpen} spec={{ title: "Video options", message: item?.original_name }} onClose={() => setMenuOpen(false)}>
      <DialogOption icon="share-outline" label="Share video link" onPress={() => { setMenuOpen(false); if (item) void shareVideoLink(item.id).catch((cause) => dialog.show("Could not share this video", cause instanceof Error ? cause.message : "Try again in a moment.")); }} />
    </Dialog>
    <MatchEditor visible={Boolean(editor)} title={editor?.match?.title ?? ""} artist={editor?.match?.artist ?? ""} manual={editor?.manual ?? false} heading={editor?.manual ? "Add song" : "Edit song"} submitLabel={editor?.manual ? "Add song" : "Save changes"} onClose={() => setEditor(null)} onSubmit={editMatch} />
    <Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} />
  </SafeAreaView>;
}

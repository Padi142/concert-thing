import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useArchive } from "../../src/hooks/useArchive";
import { EmptyState, ErrorLine, Hairline, IconButton, LoadingLine, MediaGrid } from "../../src/components/ui";
import { Dialog, DialogOption, useDialog } from "../../src/components/Dialog";
import { shareShowLink } from "../../src/components/ShowShare";
import { enqueueRecognition, recognitionSnapshot } from "../../src/lib/recognitionQueue";
import { videosForRecognitionRerun } from "../../src/lib/showRecognition";

export default function ShowDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shows, media, songMatches, loading, error, refresh } = useArchive();
  const show = shows.find((candidate) => candidate.id === id);
  const items = useMemo(() => media.filter((item) => item.show_id === id), [media, id]);
  const videos = useMemo(() => videosForRecognitionRerun(items, id), [items, id]);
  const dialog = useDialog();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanningShowId, setScanningShowId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ showId: string; total: number; failed: number } | null>(null);
  const scanning = scanningShowId === id;

  function enqueueShowRecognition() {
    if (!id) return;
    const total = videos.length;
    const showId = id;
    setScanningShowId(showId);
    setScanResult(null);
    const submissions = videos.map((video) => enqueueRecognition(video.id, true));
    void Promise.allSettled(submissions).then(() => {
      const failed = videos.filter((video) => recognitionSnapshot(video.id)?.status === "failed").length;
      setScanResult({ showId, total, failed });
      setScanningShowId((current) => current === showId ? null : current);
    });
  }

  function confirmShowRecognition() {
    if (!videos.length || scanning) return;
    const noun = videos.length === 1 ? "video" : "videos";
    dialog.show(
      `Scan ${videos.length} ${noun} again?`,
      "Each ready video in this Show will be sent to song recognition. Confirmed, edited, and manually added songs will not be overwritten.",
      [
        { label: "Cancel", tone: "quiet" },
        { label: "Scan again", onPress: enqueueShowRecognition },
      ],
    );
  }

  function shareLink() {
    if (!show) return;
    void shareShowLink(show.id, show.title).catch((cause) => {
      dialog.show("Could not share this Show", cause instanceof Error ? cause.message : "Try again in a moment.");
    });
  }

  return <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
    <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
      <View className="mb-5 flex-row items-center px-5"><IconButton icon="arrow-back" label="Go back" onPress={() => router.back()} /><View className="ml-3 min-w-0 flex-1"><Text numberOfLines={1} className="font-display text-[25px] text-ink">{show?.title ?? "Show"}</Text></View><IconButton icon="ellipsis-horizontal" label="Show options" onPress={() => setMenuOpen(true)} /></View>
      <Hairline className="mb-4" />
      {!show && loading ? <LoadingLine label="Loading show" /> : null}
      {error ? <ErrorLine message={error} onRetry={refresh} /> : null}
      {show ? <View className="px-5"><Text className="font-sans text-[16px] text-ink">{show.venue}{show.locality ? ` · ${show.locality}` : ""}</Text><Text className="mt-1 font-sans text-[14px] text-muted">{new Date(show.starts_at).toLocaleString()}{show.ends_at ? ` – ${new Date(show.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>{show.artists.length ? <View className="mt-3 flex-row flex-wrap gap-2">{show.artists.map((artist) => <Text key={artist} className="font-sans text-[14px] text-blue">{artist}</Text>)}</View> : null}</View> : null}
      {scanning ? <LoadingLine label="Submitting scans…" /> : null}
      {show && !items.length ? <EmptyState icon="images-outline" title="No media assigned" detail="Add photos or videos from Library, then assign them to this show from each media detail." /> : null}
      {show && items.length ? <View className="mt-7"><View className="mb-3 flex-row items-center justify-between px-5"><Text className="font-display text-[20px] text-ink">Archive</Text><Text className="font-sans text-[13px] text-muted">{items.length} items</Text></View>{scanResult?.showId === id ? <Text className={`mb-3 px-5 font-sans text-[14px] ${scanResult.failed ? "text-danger" : "text-success"}`}>{scanResult.failed ? `${scanResult.total - scanResult.failed} submitted · ${scanResult.failed} failed to start` : `Recognition submitted for ${scanResult.total} ${scanResult.total === 1 ? "video" : "videos"}.`}</Text> : null}<MediaGrid items={items} matches={songMatches} onPress={(item) => router.push(`/media/${item.id}`)} /></View> : null}
    </ScrollView>
    <Dialog visible={menuOpen} spec={{ title: "Show options", message: show?.title }} onClose={() => setMenuOpen(false)}>
      <DialogOption icon="share-outline" label="Share public link" detail="Anyone with the link can watch and download every video" onPress={() => { setMenuOpen(false); shareLink(); }} />
      {videos.length ? <>
        <Hairline className="mx-5" />
        <DialogOption icon="musical-notes-outline" label="Scan all videos again" detail={`Rerun recognition for all ${videos.length} ready ${videos.length === 1 ? "video" : "videos"}`} onPress={() => { setMenuOpen(false); confirmShowRecognition(); }} />
      </> : null}
    </Dialog>
    <Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} />
  </SafeAreaView>;
}

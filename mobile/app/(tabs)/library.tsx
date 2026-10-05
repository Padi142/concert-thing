import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { chooseDocuments, chooseFromPhotoLibrary, enqueueAssets } from "../../src/lib/mediaPicker";
import type { PickedAsset } from "../../src/lib/mediaPicker";
import { resumeQueue } from "../../src/lib/uploadQueue";
import { useArchive } from "../../src/hooks/useArchive";
import { useQueue } from "../../src/hooks/useQueue";
import { ErrorLine, EmptyState, Heading, Hairline, IconButton, LoadingLine, MediaTile, SearchField } from "../../src/components/ui";
import { Dialog, DialogOption, useDialog } from "../../src/components/Dialog";
import { QueueStrip } from "../../src/components/QueueStrip";
import { preferredSongMatches } from "../../src/lib/mediaDisplay";
import { useThemeTokens } from "../../src/theme/tokens";
import { AccountControl } from "../../src/components/AccountControl";
import type { MediaItem } from "../../src/types";

function groupByShow(items: MediaItem[], shows: { id: string; title: string; venue: string; starts_at: string }[]) {
  const groups = shows.map((show) => ({ show, items: items.filter((item) => item.show_id === show.id) })).filter((group) => group.items.length > 0);
  const unassigned = items.filter((item) => !item.show_id);
  if (unassigned.length) groups.push({ show: { id: "inbox", title: "Unassigned videos", venue: "", starts_at: "" }, items: unassigned });
  return groups;
}

type LibraryRow = { show: { id: string; title: string; venue: string; starts_at: string }; items: MediaItem[]; first: boolean };

export default function LibraryScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const { shows, media, songMatches, loading, error, refresh } = useArchive();
  const { uploads } = useQueue();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const dialog = useDialog();
  const [addingStatus, setAddingStatus] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return media;
    const matchingMediaIds = new Set(songMatches.filter((match) => `${match.title} ${match.artist}`.toLocaleLowerCase().includes(needle)).map((match) => match.media_id));
    return media.filter((item) => matchingMediaIds.has(item.id) || [item.original_name, item.show_title].some((value) => value?.toLocaleLowerCase().includes(needle)));
  }, [media, query, songMatches]);
  const groups = useMemo(() => groupByShow(filtered, shows), [filtered, shows]);
  const matchByMedia = useMemo(() => preferredSongMatches(songMatches), [songMatches]);
  const rows = useMemo<LibraryRow[]>(() => groups.flatMap(({ show, items }) => items.reduce<LibraryRow[]>((accumulator, item, index) => {
    const rowIndex = Math.floor(index / 3);
    const row = accumulator[rowIndex] ?? { show, items: [], first: rowIndex === 0 };
    row.items.push(item);
    accumulator[rowIndex] = row;
    return accumulator;
  }, [])), [groups]);

  async function addFrom(pick: () => Promise<PickedAsset[]>, failureTitle: string) {
    setAddingStatus("Preparing files…");
    try {
      const assets = await pick();
      if (!assets.length) return;
      // Uploads begin as soon as the first files are enqueued; the queue
      // re-reads its rows after every batch, so later copies join in flight.
      void resumeQueue();
      const result = await enqueueAssets(assets, null, ({ enqueued, failed, total }) => {
        setAddingStatus(`Adding ${enqueued} of ${total}…`);
      });
      await resumeQueue();
      if (result.failed) {
        dialog.show(failureTitle, `${result.failed} of ${assets.length} files could not be read. The rest were added to the upload queue.`);
      }
    } catch (cause) {
      dialog.show(failureTitle, cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setAddingStatus(null);
    }
  }

  function addMedia() {
    setAddOpen(true);
  }

  const listHeader = <View className="pt-3"><Heading action={<View className="flex-row items-center gap-2"><AccountControl /><IconButton icon="settings-outline" label="Open settings" onPress={() => router.push("/settings")} /><IconButton icon="add" label="Add photos or videos" onPress={addMedia} tone="accent" /></View>}>Library</Heading><QueueStrip uploads={uploads} /><SearchField value={query} onChangeText={setQuery} placeholder="Search files, shows, or songs" />{addingStatus ? <LoadingLine label={addingStatus} /> : null}{loading && !media.length ? <LoadingLine label="Loading your archive" /> : null}{error ? <ErrorLine message={error} onRetry={refresh} /> : null}</View>;
  return <SafeAreaView edges={["top"]} className="flex-1 bg-canvas"><FlashList
    data={rows}
    keyExtractor={(row, index) => `${row.show.id}-${index}`}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor={tokens.colors.accent} />}
    ListHeaderComponent={listHeader}
    ListEmptyComponent={!loading && !error ? <EmptyState icon={media.length ? "search-outline" : "images-outline"} title={media.length ? "No matches" : "Your archive starts here"} detail={media.length ? "Try a filename, show, or confirmed song title." : "Select photos or videos from local storage. They are copied into an offline-safe queue before upload."} action={!media.length ? <IconButton icon="add" label="Add your first files" onPress={addMedia} tone="accent" /> : undefined} /> : null}
    contentContainerStyle={{ paddingBottom: 32 }}
    renderItem={({ item: row }) => <View className="mb-6"><View className={`mb-3 px-5 ${row.first ? "" : "hidden"}`}>{row.show.id === "inbox" ? <Text className="font-display text-[20px] text-ink">{row.show.title}</Text> : <Pressable accessibilityRole="button" accessibilityLabel={`Open ${row.show.title}`} onPress={() => router.push(`/show/${row.show.id}`)}><Text className="font-display text-[20px] text-ink">{row.show.title}</Text></Pressable>}{row.show.id !== "inbox" ? <Text className="mt-1 font-sans text-[14px] text-muted">{row.show.venue}{row.show.starts_at ? ` · ${new Date(row.show.starts_at).toLocaleDateString()}` : ""}</Text> : null}<Hairline className="mt-3" /></View><View className="flex-row px-1">{row.items.map((item) => <View key={item.id} className="flex-1 px-0.5"><MediaTile item={item} songMatch={matchByMedia.get(item.id)} onPress={() => router.push(`/media/${item.id}`)} /></View>)}{row.items.length < 3 ? <View className="flex-1 px-0.5" /> : null}{row.items.length < 2 ? <View className="flex-1 px-0.5" /> : null}</View></View>}
  />
    <Dialog visible={addOpen} spec={{ title: "Add to archive", message: "Choose where the files are stored." }} onClose={() => setAddOpen(false)}>
      <DialogOption icon="folder-open-outline" label="Files" detail="Documents and downloads on this device" onPress={() => void addFrom(chooseDocuments, "Could not add files")} />
      <Hairline className="mx-5" />
      <DialogOption icon="images-outline" label="Photo library" detail="Photos and videos you captured" onPress={() => void addFrom(chooseFromPhotoLibrary, "Could not read photo library")} />
    </Dialog>
    <Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} />
  </SafeAreaView>;
}

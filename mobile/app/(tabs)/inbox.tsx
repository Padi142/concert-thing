import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AssignmentSheet } from "../../src/components/AssignmentSheet";
import { ErrorLine, EmptyState, Heading, Hairline, LoadingLine, MediaGrid, QuietButton, SearchField } from "../../src/components/ui";
import { useArchive } from "../../src/hooks/useArchive";
import type { MediaItem } from "../../src/types";
import { useThemeTokens } from "../../src/theme/tokens";

export default function InboxScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const { shows, media, songMatches, loading, error, refresh, assignMedia } = useArchive();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const unassigned = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return media.filter((item) => !item.show_id && (!needle || item.original_name.toLocaleLowerCase().includes(needle)));
  }, [media, query]);
  async function assign(showId: string | null) {
    if (!selected) return;
    await assignMedia(selected.id, showId);
    setSelected(null);
  }
  return <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor={tokens.colors.accent} />} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
      <Heading>Unassigned videos</Heading>
      <Text className="mx-5 mb-4 font-sans text-[15px] leading-5 text-muted">Files without a single confident event stay here until you place them.</Text>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search unassigned files" />
      {loading && !media.length ? <LoadingLine label="Checking unassigned videos" /> : null}
      {error ? <ErrorLine message={error} onRetry={refresh} /> : null}
      {!loading && !error && !unassigned.length ? <EmptyState icon="checkmark-done-outline" title="No unassigned videos" detail="You’re caught up. Ambiguous uploads will wait here until you choose a Show." /> : null}
      {unassigned.length ? <>
        <View className="mb-3 flex-row items-center justify-between px-5"><Text className="font-display text-[20px] text-ink">Unassigned videos</Text><Text className="font-sans text-[13px] text-muted">{unassigned.length}</Text></View>
        <Hairline className="mx-5 mb-3" />
        <MediaGrid items={unassigned} matches={songMatches} onPress={(item) => router.push(`/media/${item.id}`)} />
        <View className="mt-4 flex-row items-center justify-end px-5"><QuietButton onPress={() => setSelected(unassigned[unassigned.length - 1])}>Assign oldest</QuietButton></View>
      </> : null}
    </ScrollView>
    <AssignmentSheet visible={Boolean(selected)} shows={shows} selectedId={selected?.show_id ?? null} onClose={() => setSelected(null)} onSelect={(showId) => void assign(showId)} />
  </SafeAreaView>;
}

import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useArchive } from "../../src/hooks/useArchive";
import { EmptyState, ErrorLine, Heading, Hairline, IconButton, LoadingLine, SearchField } from "../../src/components/ui";
import { useThemeTokens } from "../../src/theme/tokens";

export default function ShowsScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const { shows, media, loading, error, refresh } = useArchive();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return shows.filter((show) => !needle || [show.title, show.venue, show.locality, ...show.artists].some((value) => value.toLocaleLowerCase().includes(needle)));
  }, [shows, query]);
  return <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor={tokens.colors.accent} />} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
      <Heading action={<IconButton icon="add" label="Create a show" onPress={() => router.push("/show/new")} tone="accent" />}>Shows</Heading>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search shows, venues, artists" />
      {loading && !shows.length ? <LoadingLine label="Loading shows" /> : null}
      {error ? <ErrorLine message={error} onRetry={refresh} /> : null}
      {!loading && !error && !shows.length ? <EmptyState icon="calendar-outline" title="No shows yet" detail="Create the event first, then new media can be assigned to it." action={<IconButton icon="add" label="Create your first show" onPress={() => router.push("/show/new")} tone="accent" />} /> : null}
      {!loading && !error && shows.length && !visible.length ? <EmptyState icon="search-outline" title="No matching shows" detail="Try another venue, artist, or title." /> : null}
      {visible.map((show) => {
        const count = media.filter((item) => item.show_id === show.id).length;
        return <Pressable key={show.id} accessibilityRole="button" accessibilityLabel={`Open ${show.title}`} onPress={() => router.push(`/show/${show.id}`)} className="mx-5 min-h-[92px] flex-row items-center border-b border-line py-4">
          <View className="min-w-0 flex-1"><Text numberOfLines={1} className="font-display text-[19px] text-ink">{show.title}</Text><Text numberOfLines={1} className="mt-1 font-sans text-[14px] text-muted">{show.venue}{show.locality ? ` · ${show.locality}` : ""}</Text><Text className="mt-1 font-sans text-[13px] text-subtle">{new Date(show.starts_at).toLocaleDateString()} · {count} {count === 1 ? "item" : "items"}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={tokens.colors.muted} />
        </Pressable>;
      })}
    </ScrollView>
  </SafeAreaView>;
}

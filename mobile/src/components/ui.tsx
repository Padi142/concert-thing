import { PropsWithChildren, ReactNode, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleProp, Text, TextInput, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { authenticatedMediaSource } from "../lib/api";
import { useStreamPlayback } from "../hooks/useStreamPlayback";
import { formatMediaDuration, preferredSongMatches, songMatchText } from "../lib/mediaDisplay";
import { useThemeTokens } from "../theme/tokens";
import type { MediaItem, SongMatch } from "../types";

export function Screen({ children, style, className = "" }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; className?: string }>) {
  return <View style={style} className={`flex-1 bg-canvas ${className}`}>{children}</View>;
}

export function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <View className="mb-4 flex-row items-end justify-between px-5">
    <View className="min-w-0 flex-1">
      <Text className="font-display text-[30px] leading-[34px] text-ink">{children}</Text>
    </View>
    {action}
  </View>;
}

export function Hairline({ className = "" }: { className?: string }) {
  return <View className={`h-px bg-line ${className}`} />;
}

export function IconButton({ icon, label, onPress, tone = "default" }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: "default" | "accent" }) {
  const tokens = useThemeTokens();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    className={`h-12 w-12 items-center justify-center rounded-[10px] active:opacity-60 ${tone === "accent" ? "bg-blue" : "bg-surface"}`}
    style={({ pressed }) => [{ borderWidth: tone === "accent" ? 0 : 1, borderColor: tokens.colors.controlLine }, pressed ? { opacity: 0.72 } : undefined]}
  >
    <Ionicons name={icon} size={22} color={tone === "accent" ? tokens.colors.accentInk : tokens.colors.ink} />
  </Pressable>;
}

export function PrimaryButton({ children, onPress, disabled = false, icon }: { children: ReactNode; onPress: () => void; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const tokens = useThemeTokens();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    className={`min-h-12 flex-row items-center justify-center rounded-[10px] px-5 ${disabled ? "bg-line" : "bg-blue"}`}
    style={({ pressed }) => [pressed && !disabled ? { opacity: 0.82 } : undefined]}
  >
    {icon ? <Ionicons name={icon} size={18} color={disabled ? tokens.colors.muted : tokens.colors.accentInk} style={{ marginRight: 8 }} /> : null}
    <Text className={`font-sans text-[16px] font-semibold ${disabled ? "text-muted" : "text-accentInk"}`}>{children}</Text>
  </Pressable>;
}

export function QuietButton({ children, onPress, disabled = false }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className="min-h-12 items-center justify-center px-3">
    <Text className={`font-sans text-[16px] font-semibold ${disabled ? "text-subtle" : "text-blue"}`}>{children}</Text>
  </Pressable>;
}

export function SearchField({ value, onChangeText, placeholder = "Search" }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const tokens = useThemeTokens();
  return <View className="mx-5 mb-4 min-h-12 flex-row items-center rounded-[10px] border border-control bg-surface px-3">
    <Ionicons name="search-outline" size={19} color={tokens.colors.muted} />
    <TextInput
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={tokens.colors.subtle}
      className="ml-2 flex-1 py-2 font-sans text-[16px] text-ink"
      returnKeyType="search"
      autoComplete="off"
      importantForAutofill="no"
      textContentType="none"
    />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText("")} className="h-10 w-10 items-center justify-center"><Ionicons name="close-circle" size={18} color={tokens.colors.muted} /></Pressable> : null}
  </View>;
}

export function EmptyState({ icon, title, detail, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; action?: ReactNode }) {
  const tokens = useThemeTokens();
  return <View className="mx-5 my-8 items-start border-l-2 border-blue px-4 py-2">
    <Ionicons name={icon} size={22} color={tokens.colors.accent} style={{ marginBottom: 10 }} />
    <Text className="font-display text-[21px] leading-7 text-ink">{title}</Text>
    <Text className="mt-1 max-w-[320px] font-sans text-[15px] leading-5 text-muted">{detail}</Text>
    {action ? <View className="mt-4">{action}</View> : null}
  </View>;
}

export function MediaTile({ item, onPress, localUri, compact = false, songMatch }: { item: MediaItem; onPress?: () => void; localUri?: string; compact?: boolean; songMatch?: SongMatch }) {
  const tokens = useThemeTokens();
  const [photoSource, setPhotoSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const playback = useStreamPlayback(item.id, item.media_type === "video" && item.status === "ready" && !localUri);
  const source = localUri ?? (item.media_type === "video" ? playback?.thumbnailUrl ?? null : photoSource);
  const duration = formatMediaDuration(item.duration_ms);
  const song = songMatchText(songMatch);
  useEffect(() => {
    let cancelled = false;
    setPhotoSource(null);
    setFailed(false);
    if (localUri || item.media_type === "video") return () => { cancelled = true; };
    if (item.status !== "ready") return () => { cancelled = true; };
    void authenticatedMediaSource(item.id).then((value) => { if (!cancelled) setPhotoSource(value); }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [item.id, item.media_type, item.status, localUri]);
  const accessibilityDetails = [song?.title, song?.artist, duration].filter(Boolean).join(", ");
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.original_name}${accessibilityDetails ? `, ${accessibilityDetails}` : ""}`} onPress={onPress} disabled={!onPress} className={`overflow-hidden bg-line ${compact ? "h-[112px] rounded-[10px]" : "aspect-square rounded-[12px]"}`}>
    {source && !failed ? <Image source={source} contentFit="cover" transition={0} onError={() => setFailed(true)} style={{ width: "100%", height: "100%" }} /> : <View className="flex-1 items-center justify-center" style={{ backgroundColor: tokens.colors.placeholder }}><Ionicons name={item.media_type === "video" ? "videocam-outline" : "image-outline"} size={26} color={tokens.colors.muted} /></View>}
    {item.media_type === "video" && song ? <View className="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-1.5" style={{ backgroundColor: tokens.colors.scrimStrong }}>
      <Text numberOfLines={1} className="font-sans text-[11px] font-semibold text-mediaInk">{song.title}</Text>
      <View className="mt-0.5 flex-row items-center"><Ionicons name="play" size={9} color={tokens.colors.mediaInk} /><Text numberOfLines={1} className="ml-1 flex-1 font-sans text-[10px] text-mediaInk" style={{ opacity: 0.82 }}>{[song.artist, duration].filter(Boolean).join(" · ")}</Text></View>
    </View> : null}
    {item.media_type === "video" && !song ? <View className="absolute bottom-2 left-2 flex-row items-center rounded-[5px] px-2 py-1" style={{ backgroundColor: tokens.colors.scrimStrong }}><Ionicons name="play" size={10} color={tokens.colors.mediaInk} />{duration ? <Text className="ml-1 font-sans text-[11px] text-mediaInk">{duration}</Text> : null}</View> : null}
  </Pressable>;
}

export function MediaGrid({ items, onPress, matches = [] }: { items: MediaItem[]; onPress: (item: MediaItem) => void; matches?: SongMatch[] }) {
  const matchByMedia = useMemo(() => preferredSongMatches(matches), [matches]);
  const rows = useMemo(() => {
    const chunks = [];
    for (let index = 0; index < items.length; index += 3) chunks.push(items.slice(index, index + 3));
    return chunks;
  }, [items]);
  return <View className="gap-1 px-1">
    {rows.map((row, rowIndex) => <View key={rowIndex} className="flex-row gap-1">
      {row.map((item) => <View key={item.id} className="flex-1"><MediaTile item={item} songMatch={matchByMedia.get(item.id)} onPress={() => onPress(item)} /></View>)}
      {row.length === 1 ? <View className="flex-1" /> : null}
      {row.length < 3 ? <View className="flex-1" /> : null}
    </View>)}
  </View>;
}

export function LoadingLine({ label = "Loading" }: { label?: string }) {
  const tokens = useThemeTokens();
  return <View className="flex-row items-center px-5 py-6"><ActivityIndicator size="small" color={tokens.colors.accent} /><Text className="ml-3 font-sans text-[15px] text-muted">{label}</Text></View>;
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View className="mx-5 my-3 border-l-2 border-danger px-3 py-2"><Text className="font-sans text-[15px] leading-5 text-danger">{message}</Text>{onRetry ? <QuietButton onPress={onRetry}>Try again</QuietButton> : null}</View>;
}

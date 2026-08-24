import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useEventListener } from "expo";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { authenticatedMediaSource } from "../lib/api";
import { useStreamPlayback } from "../hooks/useStreamPlayback";
import { useThemeTokens } from "../theme/tokens";
import type { MediaItem } from "../types";

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function VideoPreview({ source }: { source: { uri: string; headers?: Record<string, string> } }) {
  const tokens = useThemeTokens();
  const player = useVideoPlayer(source, (current) => {
    current.loop = false;
    current.timeUpdateEventInterval = 0.5;
  });
  const pendingAutoplaySource = useRef<string | null>(source.uri);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function clearHideTimer() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }

  function hideControlsSoon() {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2_400);
  }

  function revealControls() {
    setControlsVisible(true);
    if (player.playing) hideControlsSoon();
  }

  function togglePlayback() {
    if (player.playing) {
      player.pause();
      clearHideTimer();
      setControlsVisible(true);
    } else {
      player.play();
      hideControlsSoon();
    }
  }

  function seekBy(seconds: number) {
    player.currentTime = Math.max(0, Math.min(duration || player.duration || 0, player.currentTime + seconds));
    setCurrentTime(player.currentTime);
    hideControlsSoon();
  }

  useEffect(() => () => clearHideTimer(), []);
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "readyToPlay" && pendingAutoplaySource.current) {
      player.play();
      pendingAutoplaySource.current = null;
    }
  });
  useEventListener(player, "playingChange", ({ isPlaying: nextPlaying }) => {
    setIsPlaying(nextPlaying);
    if (!nextPlaying) {
      clearHideTimer();
      setControlsVisible(true);
    }
  });
  useEventListener(player, "sourceLoad", ({ duration: nextDuration }) => setDuration(nextDuration));
  useEventListener(player, "timeUpdate", ({ currentTime: nextTime }) => setCurrentTime(nextTime));
  useEventListener(player, "playToEnd", () => {
    setIsPlaying(false);
    setControlsVisible(true);
  });

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return <View style={{ width: "100%", aspectRatio: 4 / 3, backgroundColor: tokens.colors.ink }}>
    <VideoView player={player} nativeControls={false} contentFit="contain" style={{ width: "100%", height: "100%" }} />
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={controlsVisible ? "Hide video controls" : "Show video controls"}
      onPress={() => controlsVisible ? setControlsVisible(false) : revealControls()}
      className="absolute inset-0"
    >
      {controlsVisible ? <>
        <View className="flex-1 items-center justify-center">
          <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause video" : "Play video"} onPress={(event) => { event.stopPropagation(); togglePlayback(); }} className="h-14 w-14 items-center justify-center rounded-full" style={({ pressed }) => [{ backgroundColor: tokens.colors.scrimStrong }, pressed ? { opacity: 0.76 } : undefined]}>
            <Ionicons name={isPlaying ? "pause" : "play"} size={27} color={tokens.colors.mediaInk} style={isPlaying ? undefined : { marginLeft: 3 }} />
          </Pressable>
        </View>
        <View className="mx-3 mb-3 rounded-[10px] px-3 pb-2 pt-2" style={{ backgroundColor: tokens.colors.scrimStrong }}>
          <View className="h-0.5 overflow-hidden rounded-full bg-control"><View className="h-full bg-mediaInk" style={{ width: `${progress}%` }} /></View>
          <View className="mt-1 flex-row items-center justify-between">
            <Pressable accessibilityRole="button" accessibilityLabel="Go back 10 seconds" onPress={(event) => { event.stopPropagation(); seekBy(-10); }} className="h-11 w-11 items-center justify-center"><Ionicons name="play-back" size={18} color={tokens.colors.mediaInk} /></Pressable>
            <Text className="font-sans text-[12px] text-mediaInk">{formatTime(currentTime)} / {formatTime(duration)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Go forward 10 seconds" onPress={(event) => { event.stopPropagation(); seekBy(10); }} className="h-11 w-11 items-center justify-center"><Ionicons name="play-forward" size={18} color={tokens.colors.mediaInk} /></Pressable>
          </View>
        </View>
      </> : null}
    </Pressable>
  </View>;
}

export function MediaPreview({ item }: { item: MediaItem }) {
  const tokens = useThemeTokens();
  const [originalSource, setOriginalSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playback = useStreamPlayback(item.id, item.media_type === "video" && item.status === "ready");
  const source = item.media_type === "video" && playback?.hlsUrl ? { uri: playback.hlsUrl } : originalSource;
  useEffect(() => {
    let cancelled = false;
    setOriginalSource(null);
    setError(null);
    void authenticatedMediaSource(item.id).then((value) => { if (!cancelled) setOriginalSource(value); }).catch(() => { if (!cancelled) setError("Media could not be loaded"); });
    return () => { cancelled = true; };
  }, [item.id]);
  if (error) return <View className="aspect-[4/3] items-center justify-center" style={{ backgroundColor: tokens.colors.placeholder }}><Text className="font-sans text-[15px] text-muted">{error}</Text></View>;
  if (!source) return <View className="aspect-[4/3] items-center justify-center" style={{ backgroundColor: tokens.colors.placeholder }}><Text className="font-sans text-[15px] text-muted">Loading preview…</Text></View>;
  if (item.media_type === "video") return <VideoPreview source={source} />;
  return <Image source={source} contentFit="contain" transition={0} style={{ width: "100%", aspectRatio: 4 / 3, backgroundColor: tokens.colors.surface }} />;
}

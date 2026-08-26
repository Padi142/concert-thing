import "../global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SpaceGrotesk_600SemiBold } from "@expo-google-fonts/space-grotesk";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { useAuth, ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useIncomingShare } from "expo-sharing";
import { Platform, useColorScheme, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { darkTokens, lightTokens, themeVariables } from "../src/theme/tokens";
import { AuthLanding } from "../src/components/AuthLanding";
import { CLERK_PUBLISHABLE_KEY } from "../src/lib/clerk";
import { claimLegacyData, resetApiConfigCache } from "../src/lib/api";
import { enqueueSharedVideos } from "../src/lib/incomingShareQueue";
import { resetRecognitionQueue } from "../src/lib/recognitionQueue";
import { resumeQueue } from "../src/lib/uploadQueue";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_600SemiBold, IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold });
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";
  const activeTokens = dark ? darkTokens : lightTokens;
  const navigationTheme = dark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, primary: activeTokens.colors.accent, background: activeTokens.colors.canvas, card: activeTokens.colors.surface, text: activeTokens.colors.ink, border: activeTokens.colors.line, notification: activeTokens.colors.danger } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: activeTokens.colors.accent, background: activeTokens.colors.canvas, card: activeTokens.colors.surface, text: activeTokens.colors.ink, border: activeTokens.colors.line, notification: activeTokens.colors.danger } };
  if (!fontsLoaded) return <View className="flex-1 bg-canvas" style={themeVariables[dark ? "dark" : "light"]} />;
  if (!CLERK_PUBLISHABLE_KEY) return <View className="flex-1 items-center justify-center bg-canvas px-6" style={themeVariables[dark ? "dark" : "light"]}><Text className="text-center font-display text-[24px] text-ink">Clerk is not configured</Text><Text className="mt-2 text-center font-sans text-[15px] leading-5 text-muted">Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the mobile build environment, then restart Expo.</Text></View>;
  return <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
    <View className="flex-1" style={themeVariables[dark ? "dark" : "light"]}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={dark ? "light" : "dark"} />
        <AuthenticatedApp />
      </ThemeProvider>
    </View>
  </ClerkProvider>;
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const previousUserId = useRef<string | null | undefined>(undefined);
  const [preparedUserId, setPreparedUserId] = useState<string | null>(null);
  const legacyReady = Boolean(isSignedIn && userId && preparedUserId === userId);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      resetApiConfigCache();
      resetRecognitionQueue();
    }
    previousUserId.current = userId;
    if (!isSignedIn || !userId) {
      return () => { cancelled = true; };
    }
    // This is intentionally completed before the archive stack mounts. The
    // backend response is also the authority for claiming pre-Clerk local
    // queue rows; a later account can never adopt another account's files.
    void claimLegacyData().then(({ legacyOwner }) => {
      if (cancelled) return;
      setPreparedUserId(userId);
      void resumeQueue({ claimUnowned: legacyOwner });
    }).catch(() => {
      if (cancelled) return;
      // A temporary claim endpoint failure should not block a user who already
      // has account-scoped data. Keep legacy rows hidden until the next retry.
      setPreparedUserId(userId);
      void resumeQueue();
    });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId]);

  if (!isLoaded) return <AuthLanding loading />;
  if (!isSignedIn) return <AuthLanding />;
  if (!legacyReady) return <AuthLanding loading />;
  return <>
    {Platform.OS === "web" ? null : <IncomingShareBridge />}
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="show/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="show/[id]" />
      <Stack.Screen name="media/[id]" />
      <Stack.Screen name="settings" options={{ presentation: "modal" }} />
    </Stack>
  </>;
}

function IncomingShareBridge() {
  const { resolvedSharedPayloads, isResolving, clearSharedPayloads, refreshSharePayloads } = useIncomingShare();
  const processedShareKey = useRef<string | null>(null);
  const shareKey = resolvedSharedPayloads.map((payload) => `${payload.value}|${payload.contentUri ?? ""}`).join("\n");

  useEffect(() => {
    if (!shareKey) {
      processedShareKey.current = null;
      return;
    }
    if (isResolving || processedShareKey.current === shareKey) return;
    processedShareKey.current = shareKey;
    let cancelled = false;
    void (async () => {
      void resumeQueue();
      await enqueueSharedVideos(resolvedSharedPayloads);
      if (!cancelled) {
        clearSharedPayloads();
        void refreshSharePayloads();
      }
      await resumeQueue();
    })().catch(() => {
      // Keep the native share payload available if copying the files failed.
      processedShareKey.current = null;
    });
    return () => { cancelled = true; };
  }, [clearSharedPayloads, isResolving, refreshSharePayloads, resolvedSharedPayloads, shareKey]);

  return null;
}

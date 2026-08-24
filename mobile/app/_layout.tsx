import "../global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SpaceGrotesk_600SemiBold } from "@expo-google-fonts/space-grotesk";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { useAuth, ClerkProvider } from "@clerk/expo";
import { useAuthViewState } from "@clerk/expo/native";
import { tokenCache } from "@clerk/expo/token-cache";
import { useColorScheme, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { darkTokens, lightTokens, themeVariables } from "../src/theme/tokens";
import { AuthLanding } from "../src/components/AuthLanding";
import { CLERK_PUBLISHABLE_KEY } from "../src/lib/clerk";
import { claimLegacyData, resetApiConfigCache } from "../src/lib/api";
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
  // Native auth can expose a signed-in session while Clerk is still finishing
  // its native post-authentication work. Keep that state distinct from a
  // completed flow so the auth surface is not unmounted too early.
  const { isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: authViewLoaded, isAuthFlowComplete } = useAuthViewState();
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

  if (!isLoaded || !authViewLoaded) return <AuthLanding loading />;
  if (!isSignedIn) return <AuthLanding />;
  if (!isAuthFlowComplete) return <AuthLanding />;
  if (!legacyReady) return <AuthLanding loading />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="show/new" options={{ presentation: "modal" }} />
    <Stack.Screen name="show/[id]" />
    <Stack.Screen name="media/[id]" />
    <Stack.Screen name="settings" options={{ presentation: "modal" }} />
  </Stack>;
}

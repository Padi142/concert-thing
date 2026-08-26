import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { useClerk } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeTokens } from "../theme/tokens";
import { useState } from "react";

export function AuthLanding({ loading = false }: { loading?: boolean }) {
  const tokens = useThemeTokens();
  const clerk = useClerk();
  const { startHostedAuth } = useHostedAuth();
  const nativeAuth = Platform.OS === "ios" || Platform.OS === "android";
  const androidHostedAuthRedirectUrl = "clerk://com.padi142.concertthing.hosted-callback";
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  async function startNativeAuth(mode: "sign-in" | "sign-up") {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await startHostedAuth({
        mode,
        ...(Platform.OS === "android" ? { redirectUrl: androidHostedAuthRedirectUrl } : {}),
      });
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Could not open secure sign-in.");
    } finally {
      setAuthBusy(false);
    }
  }

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator size="small" color={tokens.colors.accent} /></View>;
  }

  const primaryAction = nativeAuth ? () => void startNativeAuth("sign-in") : () => void clerk.openSignIn();
  const createAction = nativeAuth ? () => void startNativeAuth("sign-up") : () => void clerk.openSignUp();

  return <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-canvas">
    <View className="flex-1 justify-center px-5">
      <Text className="font-display text-[40px] leading-[44px] text-ink">Concert Thing</Text>
      <View className="mt-7 gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Sign in to archive" disabled={authBusy} onPress={primaryAction} className="min-h-12 items-center justify-center rounded-[10px] bg-blue px-5" style={({ pressed }) => [pressed ? { opacity: 0.82 } : undefined]}>
          {authBusy ? <ActivityIndicator size="small" color={tokens.colors.accentInk} /> : <Text className="font-sans text-[16px] font-semibold text-accentInk">Sign in to archive</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create account" disabled={authBusy} onPress={createAction} className="min-h-12 items-center justify-center rounded-[10px] bg-surface px-5" style={({ pressed }) => [{ borderWidth: 1, borderColor: tokens.colors.controlLine }, pressed ? { opacity: 0.72 } : undefined]}>
          <Text className="font-sans text-[16px] font-semibold text-ink">Create account</Text>
        </Pressable>
        {authError ? <Text accessibilityRole="alert" className="mt-1 font-sans text-[13px] leading-5 text-danger">{authError}</Text> : null}
      </View>
    </View>
  </SafeAreaView>;
}

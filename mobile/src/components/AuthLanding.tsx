import { useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { useClerk } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeTokens } from "../theme/tokens";

function isAppleRequestCanceled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ERR_REQUEST_CANCELED";
}

export function AuthLanding({ loading = false }: { loading?: boolean }) {
  const tokens = useThemeTokens();
  const clerk = useClerk();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
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

  async function startAppleAuth() {
    if (authBusy) return;

    setAuthBusy(true);
    setAuthError(null);
    try {
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (cause) {
      if (!isAppleRequestCanceled(cause)) {
        setAuthError(cause instanceof Error ? cause.message : "Could not sign in with Apple.");
      }
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
        {Platform.OS === "ios" ? (
          <AppleAuthentication.AppleAuthenticationButton
            accessibilityLabel="Continue with Apple"
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={10}
            onPress={() => void startAppleAuth()}
            pointerEvents={authBusy ? "none" : "auto"}
            style={{ width: "100%", height: 48, opacity: authBusy ? 0.6 : 1 }}
          />
        ) : null}
        {authError ? <Text accessibilityRole="alert" className="mt-1 font-sans text-[13px] leading-5 text-danger">{authError}</Text> : null}
      </View>
    </View>
  </SafeAreaView>;
}

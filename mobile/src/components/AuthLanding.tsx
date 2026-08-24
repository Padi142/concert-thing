import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from "react-native";
import { AuthView } from "@clerk/expo/native";
import { useClerk } from "@clerk/expo";
import { useThemeTokens } from "../theme/tokens";
import { useState } from "react";

export function AuthLanding({ loading = false }: { loading?: boolean }) {
  const tokens = useThemeTokens();
  const clerk = useClerk();
  const nativeAuth = Platform.OS === "ios" || Platform.OS === "android";
  const [authOpen, setAuthOpen] = useState(nativeAuth);

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator size="small" color={tokens.colors.accent} /><Text className="mt-3 font-sans text-[15px] text-muted">Preparing secure sign-in…</Text></View>;
  }

  return <View className="flex-1 bg-canvas">
    <View className="px-6 pb-3 pt-8">
      <Text className="font-sans text-[12px] font-semibold uppercase tracking-[1.6px] text-blue">Concert Thing</Text>
      <Text className="mt-2 font-display text-[30px] leading-9 text-ink">Your archive, ready when you are.</Text>
      <Text className="mt-2 font-sans text-[15px] leading-5 text-muted">Sign in to keep shows, uploads, and recognition results synced to your account.</Text>
    </View>
    {nativeAuth ? <>
      <View className="mx-6 mt-6 rounded-[16px] border border-control bg-surface p-5">
        <Text className="font-display text-[21px] text-ink">Continue securely</Text>
        <Text className="mt-2 font-sans text-[15px] leading-5 text-muted">Use your Clerk account to enter the archive or create a new one.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open sign in" onPress={() => setAuthOpen(true)} className="mt-5 min-h-12 items-center justify-center rounded-[10px] bg-blue"><Text className="font-sans text-[16px] font-semibold text-accentInk">Continue</Text></Pressable>
      </View>
      {/* Clerk's Android Compose view needs a modal host; an inline flex host
          renders only its header/footer and leaves the form body empty. */}
      <Modal
        animationType="slide"
        visible={authOpen}
        presentationStyle="pageSheet"
        onRequestClose={() => setAuthOpen(false)}
      >
        <View className="flex-1 bg-surface">
          <AuthView mode="signInOrUp" onDismiss={() => setAuthOpen(false)} />
        </View>
      </Modal>
    </> : <View className="mx-6 mt-6 rounded-[16px] border border-control bg-surface p-5">
      <Text className="font-display text-[21px] text-ink">Continue securely</Text>
      <Text className="mt-2 font-sans text-[15px] leading-5 text-muted">Use your Clerk account to enter the archive or create a new one.</Text>
      <View className="mt-5 gap-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Sign in" onPress={() => void clerk.openSignIn()} className="min-h-12 items-center justify-center rounded-[10px] bg-blue"><Text className="font-sans text-[16px] font-semibold text-accentInk">Sign in</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create account" onPress={() => void clerk.openSignUp()} className="min-h-12 items-center justify-center rounded-[10px] border border-control bg-surface"><Text className="font-sans text-[16px] font-semibold text-ink">Create account</Text></Pressable>
      </View>
    </View>}
  </View>;
}

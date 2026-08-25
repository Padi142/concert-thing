import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { clearApiConfig, DEFAULT_API_URL, loadApiConfig, loadAutoRecognition, saveApiConfig, saveAutoRecognition } from "../src/lib/config";
import { request, resetApiConfigCache } from "../src/lib/api";
import { useClerk } from "@clerk/expo";
import { AccountControl } from "../src/components/AccountControl";
import { useThemeTokens } from "../src/theme/tokens";
import { Hairline, PrimaryButton } from "../src/components/ui";
import { Dialog, useDialog } from "../src/components/Dialog";
import { StorageMeter } from "../src/components/StorageMeter";
import { useStorage } from "../src/hooks/useStorage";

export default function SettingsScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const clerk = useClerk();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_URL);
  const [busy, setBusy] = useState(false);
  const [autoRecognize, setAutoRecognize] = useState(false);
  const [autoPreferenceLoaded, setAutoPreferenceLoaded] = useState(false);
  const [savingAutoRecognize, setSavingAutoRecognize] = useState(false);
  const dialog = useDialog();
  const { storage, loading: storageLoading } = useStorage();
  useEffect(() => {
    void loadApiConfig().then((config) => { if (config) setBaseUrl(config.baseUrl); });
    void loadAutoRecognition().then(setAutoRecognize).finally(() => setAutoPreferenceLoaded(true));
  }, []);
  async function toggleAutoRecognition(enabled: boolean) {
    const previous = autoRecognize;
    setAutoRecognize(enabled);
    setSavingAutoRecognize(true);
    try {
      await saveAutoRecognition(enabled);
    } catch (cause) {
      setAutoRecognize(previous);
      dialog.show("Could not save setting", cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setSavingAutoRecognize(false);
    }
  }
  async function save() {
    if (!baseUrl.trim()) { dialog.show("Missing archive URL", "Add the URL of your archive service."); return; }
    setBusy(true);
    try {
      await saveApiConfig({ baseUrl: baseUrl.trim() });
      resetApiConfigCache();
      await request("/api/shows");
      dialog.show("Connected", "Your Clerk account can now access this archive.", [{ label: "Done", onPress: () => router.back() }]);
    } catch (cause) {
      dialog.show("Could not connect", cause instanceof Error ? cause.message : "Check the archive URL and your Clerk session.");
    } finally { setBusy(false); }
  }
  async function clear() {
    await clearApiConfig();
    resetApiConfigCache();
    setBaseUrl(DEFAULT_API_URL);
    dialog.show("Archive URL reset", "The default archive URL will be used next time.");
  }
  return <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-canvas">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
      <View className="mb-5 flex-row items-center px-5"><Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => router.back()} className="mr-3 h-12 w-12 items-center justify-center"><Ionicons name="close" size={25} color={tokens.colors.ink} /></Pressable><View><Text className="font-sans text-[12px] font-semibold uppercase tracking-[1.2px] text-muted">Private connection</Text><Text className="font-display text-[28px] text-ink">Settings</Text></View></View>
      <Hairline className="mb-6" />
      <View className="px-5"><Text className="mb-2 font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">Archive URL</Text><TextInput accessibilityLabel="Archive URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={DEFAULT_API_URL} placeholderTextColor={tokens.colors.subtle} className="mb-3 min-h-12 rounded-[10px] border border-control bg-surface px-3 font-sans text-[16px] text-ink" /><Text className="mb-6 font-sans text-[14px] leading-5 text-muted">The default service is already configured. Clerk refreshes a short-lived session token for each authenticated request; no permanent owner token is stored on this device.</Text><PrimaryButton onPress={() => void save()} disabled={busy || !baseUrl.trim()}>{busy ? "Checking…" : "Save and connect"}</PrimaryButton><Pressable accessibilityRole="button" accessibilityLabel="Reset archive URL" onPress={() => void clear()} className="mt-5 min-h-12 items-center justify-center"><Text className="font-sans text-[16px] font-semibold text-danger">Reset archive URL</Text></Pressable></View>
      <Hairline className="mx-5 my-6" />
      <View><Text className="mb-3 px-5 font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">Storage allowance</Text><StorageMeter storage={storage} loading={storageLoading} /></View>
      <Hairline className="mx-5 my-6" />
      <View className="px-5"><Text className="mb-3 font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">Your account</Text><View className="rounded-[12px] border border-control bg-surface px-3 py-3"><AccountControl withLabel /></View><Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void clerk.signOut()} className="mt-3 min-h-12 items-center justify-center"><Text className="font-sans text-[16px] font-semibold text-danger">Sign out</Text></Pressable></View>
      <Hairline className="mx-5 my-6" />
      <View className="px-5">
        <Text className="font-sans text-[13px] font-semibold uppercase tracking-[1px] text-muted">Song recognition</Text>
        <View className="mt-3 flex-row items-center justify-between">
          <View className="mr-5 min-w-0 flex-1"><Text className="font-sans text-[17px] font-semibold text-ink">Automatically recognize songs</Text><Text className="mt-1 font-sans text-[14px] leading-5 text-muted">Send every newly uploaded video to the background recognition queue.</Text></View>
          <Switch accessibilityLabel="Automatically recognize songs" value={autoRecognize} disabled={!autoPreferenceLoaded || savingAutoRecognize} onValueChange={(enabled) => void toggleAutoRecognition(enabled)} trackColor={{ false: tokens.colors.controlLine, true: tokens.colors.accent }} thumbColor={tokens.colors.surface} />
        </View>
      </View>
    </ScrollView></KeyboardAvoidingView>
    <Dialog visible={Boolean(dialog.spec)} spec={dialog.spec} onClose={dialog.close} />
  </SafeAreaView>;
}

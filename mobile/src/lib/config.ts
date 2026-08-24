import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { ApiConfig } from "../types";

const BASE_URL_KEY = "concert-thing.api-url";
const LEGACY_OWNER_TOKEN_KEY = "concert-thing.owner-token";
const AUTO_RECOGNIZE_KEY = "concert-thing.auto-recognize";
const DEFAULT_API_URL = "https://shows.krejzac.cz";

function trimBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export async function loadApiConfig(): Promise<ApiConfig | null> {
  if (Platform.OS === "web") return { baseUrl: DEFAULT_API_URL };
  const [baseUrl] = await Promise.all([
    SecureStore.getItemAsync(BASE_URL_KEY),
    // Remove the pre-Clerk credential without ever reading it into JS.
    SecureStore.deleteItemAsync(LEGACY_OWNER_TOKEN_KEY),
  ]);
  return { baseUrl: trimBaseUrl(baseUrl || DEFAULT_API_URL) };
}

export async function saveApiConfig(config: ApiConfig): Promise<void> {
  if (Platform.OS === "web") throw new Error("Connect from the iOS or Android development build.");
  await Promise.all([
    SecureStore.setItemAsync(BASE_URL_KEY, trimBaseUrl(config.baseUrl)),
    SecureStore.deleteItemAsync(LEGACY_OWNER_TOKEN_KEY),
  ]);
}

export async function clearApiConfig(): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.all([
    SecureStore.deleteItemAsync(BASE_URL_KEY),
    SecureStore.deleteItemAsync(LEGACY_OWNER_TOKEN_KEY),
  ]);
}

export async function loadAutoRecognition(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return await SecureStore.getItemAsync(AUTO_RECOGNIZE_KEY) === "true";
}

export async function saveAutoRecognition(enabled: boolean): Promise<void> {
  if (Platform.OS === "web") throw new Error("Change this setting from the iOS or Android development build.");
  await SecureStore.setItemAsync(AUTO_RECOGNIZE_KEY, String(enabled));
}

export { DEFAULT_API_URL };

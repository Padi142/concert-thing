import { getClerkInstance } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";

/**
 * Expo inlines EXPO_PUBLIC_* values at build time. Keep this key in the
 * client bundle only; Clerk publishable keys are designed to be public.
 */
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

let loadPromise: Promise<ReturnType<typeof getClerkInstance>> | null = null;

function instance(): ReturnType<typeof getClerkInstance> | null {
  if (!CLERK_PUBLISHABLE_KEY) return null;
  return getClerkInstance({ publishableKey: CLERK_PUBLISHABLE_KEY, tokenCache });
}

/**
 * Resolve the active Clerk instance for API calls and background tasks. The
 * provider normally loads this instance for the foreground app; calling load
 * here also makes the same path work when Expo resumes a background task in a
 * fresh JS process.
 */
export async function getLoadedClerk() {
  const clerk = instance();
  if (!clerk) return null;
  if (!clerk.loaded) {
    loadPromise ??= (async () => {
      await clerk.load();
      return clerk;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
    await loadPromise;
  }
  return clerk;
}

export async function getSessionToken(): Promise<string | null> {
  const clerk = await getLoadedClerk();
  return (await clerk?.session?.getToken()) ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const clerk = await getLoadedClerk();
  return clerk?.user?.id ?? null;
}

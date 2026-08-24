import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useClerk, useUser } from "@clerk/expo";
import { UserButton as NativeUserButton } from "@clerk/expo/native";
import { useThemeTokens } from "../theme/tokens";

/** A compact signed-in control for the Library header and Settings. */
export function AccountControl({ withLabel = false }: { withLabel?: boolean }) {
  const tokens = useThemeTokens();
  const { user } = useUser();
  const clerk = useClerk();
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase()
    || user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase()
    || "U";
  const label = user?.firstName || user?.primaryEmailAddress?.emailAddress || "Account";

  if (Platform.OS !== "web") {
    return <View className={withLabel ? "flex-row items-center" : ""}>
      {withLabel ? <View className="mr-3 min-w-0 flex-1"><Text numberOfLines={1} className="font-sans text-[16px] font-semibold text-ink">{label}</Text><Text className="mt-0.5 font-sans text-[13px] text-muted">Signed in with Clerk</Text></View> : null}
      <NativeUserButton />
    </View>;
  }

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Open account profile"
    onPress={() => void clerk.openUserProfile()}
    className={withLabel ? "min-h-12 flex-row items-center rounded-[10px] border border-control bg-surface px-3" : "h-10 w-10 items-center justify-center rounded-full bg-blue"}
  >
    <View className={withLabel ? "mr-3 h-8 w-8 items-center justify-center rounded-full bg-blue" : "h-10 w-10 items-center justify-center rounded-full bg-blue"}>
      <Text className="font-sans text-[14px] font-semibold text-accentInk">{initials}</Text>
    </View>
    {withLabel ? <View className="min-w-0 flex-1"><Text numberOfLines={1} className="font-sans text-[16px] font-semibold text-ink">{label}</Text><Text className="mt-0.5 font-sans text-[13px] text-muted">Signed in with Clerk</Text></View> : null}
    {withLabel ? <Ionicons name="chevron-forward" size={18} color={tokens.colors.muted} /> : null}
  </Pressable>;
}

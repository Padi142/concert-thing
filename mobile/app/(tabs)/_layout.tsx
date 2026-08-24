import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarLayout } from "../../src/lib/tabBarLayout";
import { useThemeTokens } from "../../src/theme/tokens";

export default function TabsLayout() {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const tabBarLayout = getTabBarLayout(insets.bottom);

  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: tokens.colors.accent,
    tabBarInactiveTintColor: tokens.colors.muted,
    tabBarStyle: { backgroundColor: tokens.colors.surface, borderTopColor: tokens.colors.line, ...tabBarLayout },
    tabBarLabelStyle: { fontFamily: tokens.typography.bodyMedium, fontSize: 12 },
    tabBarIcon: ({ color, size }) => {
      const icons: Record<string, keyof typeof Ionicons.glyphMap> = { library: "grid-outline", inbox: "file-tray-outline", shows: "calendar-outline", queue: "cloud-upload-outline" };
      return <Ionicons name={icons[route.name] ?? "ellipse-outline"} color={color} size={size} />;
    },
  })}>
    <Tabs.Screen name="library" options={{ title: "Library" }} />
    <Tabs.Screen name="inbox" options={{ title: "Inbox" }} />
    <Tabs.Screen name="shows" options={{ title: "Shows" }} />
    <Tabs.Screen name="queue" options={{ title: "Queue" }} />
  </Tabs>;
}

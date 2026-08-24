import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeTokens } from "../theme/tokens";
import type { Show } from "../types";
import { Hairline } from "./ui";

export function AssignmentSheet({ visible, shows, selectedId, onClose, onSelect, onCreateNew }: { visible: boolean; shows: Show[]; selectedId: string | null; onClose: () => void; onSelect: (showId: string | null) => void; onCreateNew?: () => void }) {
  const tokens = useThemeTokens();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View className="flex-1 justify-end" style={{ backgroundColor: tokens.colors.scrim }}>
      <View className="max-h-[78%] rounded-t-[20px] bg-surface pb-8 pt-3">
        <View className="flex-row items-center justify-between px-5 pb-3">
          <View><Text className="font-display text-[23px] text-ink">Assign to show</Text><Text className="mt-1 font-sans text-[14px] text-muted">Choose one event or leave it in Inbox.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close assignment sheet" onPress={onClose} className="h-12 w-12 items-center justify-center"><Ionicons name="close" size={24} color={tokens.colors.ink} /></Pressable>
        </View>
        <Hairline />
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {onCreateNew ? <>
            <Pressable accessibilityRole="button" accessibilityLabel="Create a new show for this video" onPress={onCreateNew} className="mx-5 my-4 min-h-14 flex-row items-center rounded-[12px] bg-blue px-4" style={({ pressed }) => pressed ? { opacity: 0.82 } : undefined}>
              <View className="h-9 w-9 items-center justify-center rounded-full bg-blueSoft"><Ionicons name="add" size={22} color={tokens.colors.accent} /></View>
              <View className="ml-3 min-w-0 flex-1"><Text className="font-sans text-[16px] font-semibold text-accentInk">Create new show</Text><Text className="mt-0.5 font-sans text-[13px] text-accentInk" style={{ opacity: 0.82 }}>Start with this video and sync nearby clips</Text></View>
              <Ionicons name="arrow-forward" size={20} color={tokens.colors.accentInk} />
            </Pressable>
            <Hairline className="mb-1" />
          </> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Remove show assignment" onPress={() => onSelect(null)} className="min-h-14 flex-row items-center px-5">
            <Ionicons name={!selectedId ? "radio-button-on" : "radio-button-off"} size={21} color={!selectedId ? tokens.colors.accent : tokens.colors.muted} />
            <Text className="ml-3 font-sans text-[16px] text-ink">Inbox — unassigned</Text>
          </Pressable>
          {shows.map((show) => <Pressable key={show.id} accessibilityRole="button" accessibilityLabel={`Assign to ${show.title}`} onPress={() => onSelect(show.id)} className="min-h-14 flex-row items-center px-5">
            <Ionicons name={selectedId === show.id ? "radio-button-on" : "radio-button-off"} size={21} color={selectedId === show.id ? tokens.colors.accent : tokens.colors.muted} />
            <View className="ml-3 min-w-0 flex-1"><Text numberOfLines={1} className="font-sans text-[16px] text-ink">{show.title}</Text><Text numberOfLines={1} className="mt-0.5 font-sans text-[13px] text-muted">{show.venue}{show.locality ? ` · ${show.locality}` : ""}</Text></View>
          </Pressable>)}
          {!shows.length ? <Text className="px-5 py-6 font-sans text-[15px] text-muted">No existing shows yet.</Text> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

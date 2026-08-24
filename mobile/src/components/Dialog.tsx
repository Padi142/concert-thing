import { ReactNode, useCallback, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeTokens } from "../theme/tokens";
import { Hairline } from "./ui";

export type DialogAction = { label: string; onPress?: () => void; tone?: "accent" | "danger" | "quiet" };
export type DialogSpec = { title: string; message?: string; actions?: DialogAction[] };

export function useDialog() {
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const show = useCallback((title: string, message?: string, actions?: DialogAction[]) => setSpec({ title, message, actions }), []);
  const close = useCallback(() => setSpec(null), []);
  return { spec, show, close };
}

function DialogButton({ action, onClose }: { action: DialogAction; onClose: () => void }) {
  const press = () => { onClose(); action.onPress?.(); };
  if (action.tone === "quiet") {
    return <Pressable accessibilityRole="button" onPress={press} className="min-h-12 items-center justify-center px-5 active:opacity-60">
      <Text className="font-sans text-[16px] font-semibold text-blue">{action.label}</Text>
    </Pressable>;
  }
  const danger = action.tone === "danger";
  return <Pressable accessibilityRole="button" onPress={press} className={`min-h-12 flex-row items-center justify-center rounded-[10px] px-5 active:opacity-60 ${danger ? "border border-danger" : "bg-blue"}`}>
    <Text className={`font-sans text-[16px] font-semibold ${danger ? "text-danger" : "text-accentInk"}`}>{action.label}</Text>
  </Pressable>;
}

export function DialogOption({ icon, label, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; onPress: () => void }) {
  const tokens = useThemeTokens();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="min-h-16 flex-row items-center px-5 active:opacity-60">
    <View className="h-10 w-10 items-center justify-center rounded-full bg-blueSoft"><Ionicons name={icon} size={20} color={tokens.colors.accent} /></View>
    <View className="ml-3 min-w-0 flex-1">
      <Text className="font-sans text-[16px] font-semibold text-ink">{label}</Text>
      {detail ? <Text className="mt-0.5 font-sans text-[13px] text-muted">{detail}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={18} color={tokens.colors.subtle} />
  </Pressable>;
}

export function Dialog({ visible, spec, onClose, children }: { visible: boolean; spec?: DialogSpec | null; onClose: () => void; children?: ReactNode }) {
  const tokens = useThemeTokens();
  const title = spec?.title ?? "";
  const message = spec?.message;
  const actions = spec?.actions ?? [];
  const showClose = Boolean(children) || actions.length !== 1;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View className="flex-1 justify-end" style={{ backgroundColor: tokens.colors.scrim }}>
      <View className="rounded-t-[20px] bg-surface pb-8 pt-3">
        <View className="flex-row items-center justify-between px-5 pb-3">
          <View className="min-w-0 flex-1">
            <Text className="font-display text-[23px] text-ink">{title}</Text>
            {message ? <Text className="mt-1 font-sans text-[14px] leading-5 text-muted">{message}</Text> : null}
          </View>
          {showClose ? <Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={onClose} className="h-12 w-12 items-center justify-center"><Ionicons name="close" size={24} color={tokens.colors.ink} /></Pressable> : null}
        </View>
        <Hairline />
        {children ? <View className="pt-1">{children}</View> : null}
        {actions.length ? <View className="gap-2 px-5 pt-4">{actions.map((action) => <DialogButton key={action.label} action={action} onClose={onClose} />)}</View> : null}
      </View>
    </View>
  </Modal>;
}

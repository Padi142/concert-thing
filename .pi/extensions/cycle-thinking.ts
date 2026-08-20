import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";

export default function cycleThinkingExtension(pi: ExtensionAPI) {
  pi.registerShortcut("ctrl+n", {
    description: "Cycle the current model's thinking level",
    handler: async (ctx) => {
      const model = ctx.model;

      if (!model?.reasoning) {
        ctx.ui.notify("Current model does not support thinking", "warning");
        return;
      }

      const levels = getSupportedThinkingLevels(model);
      const current = pi.getThinkingLevel();
      const currentIndex = levels.indexOf(current);
      const next = levels[(currentIndex + 1) % levels.length];

      pi.setThinkingLevel(next);
      ctx.ui.notify(`Thinking level: ${pi.getThinkingLevel()}`, "info");
    },
  });
}

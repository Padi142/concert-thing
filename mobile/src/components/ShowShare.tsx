import { Share } from "react-native";
import { createShowShare } from "../lib/api";

export async function shareShowLink(showId: string, showTitle: string): Promise<void> {
  try {
    const share = await createShowShare(showId);
    if (!share.url) throw new Error("Could not create the public link");
    await Share.share({
      title: showTitle,
      message: `Watch the videos from ${showTitle}\n${share.url}`,
      url: share.url,
    });
  } catch (cause) {
    // Dismissing the native share sheet is not an error worth surfacing.
    if (cause instanceof Error && cause.message.toLowerCase().includes("cancel")) return;
    throw cause instanceof Error ? cause : new Error("Try again in a moment.");
  }
}

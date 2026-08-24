import { Share } from "react-native";
import { createVideoShare } from "../lib/api";

export async function shareVideoLink(mediaId: string, mediaName: string): Promise<void> {
  try {
    const share = await createVideoShare(mediaId);
    if (!share.url) throw new Error("Could not create the public video link");
    await Share.share({
      title: mediaName,
      message: `Watch ${mediaName}\n${share.url}`,
      url: share.url,
    });
  } catch (cause) {
    // Dismissing the native share sheet is not an error worth surfacing.
    if (cause instanceof Error && cause.message.toLowerCase().includes("cancel")) return;
    throw cause instanceof Error ? cause : new Error("Try again in a moment.");
  }
}

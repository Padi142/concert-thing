import type { ResolvedSharePayload } from "expo-sharing";
import { enqueueAssets, type EnqueueProgress, type EnqueueResult } from "./mediaPicker";
import { sharedVideosToAssets } from "./incomingShare";

export async function enqueueSharedVideos(
  payloads: ResolvedSharePayload[],
  onProgress?: (progress: EnqueueProgress) => void,
): Promise<EnqueueResult> {
  return enqueueAssets(sharedVideosToAssets(payloads), null, onProgress);
}

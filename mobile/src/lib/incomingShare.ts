import type { ResolvedSharePayload } from "expo-sharing";
import type { PickedAsset } from "./mediaPicker";

const DEFAULT_VIDEO_MIME_TYPE = "video/mp4";

function firstNonEmpty(values: (string | null | undefined)[]): string | null {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

function nameFromUri(uri: string): string | null {
  const withoutQuery = uri.split(/[?#]/, 1)[0];
  const lastComponent = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  if (!lastComponent) return null;
  try {
    return decodeURIComponent(lastComponent);
  } catch {
    return lastComponent;
  }
}

export function isSharedVideo(payload: ResolvedSharePayload): payload is Extract<ResolvedSharePayload, { contentUri: string }> {
  if (!payload.contentUri) return false;
  if (payload.contentType === "video" || payload.shareType === "video") return true;
  return [payload.contentMimeType, payload.mimeType].some((mimeType) => mimeType?.toLowerCase().startsWith("video/") ?? false);
}

function videoMimeType(payload: ResolvedSharePayload): string {
  const mimeType = [payload.contentMimeType, payload.mimeType]
    .find((value) => value?.toLowerCase().startsWith("video/") && !value.endsWith("/*"));
  return mimeType ?? DEFAULT_VIDEO_MIME_TYPE;
}

export function sharedVideosToAssets(payloads: ResolvedSharePayload[]): PickedAsset[] {
  return payloads.filter(isSharedVideo).map((payload, index) => {
    const mimeType = videoMimeType(payload);
    const name = firstNonEmpty([payload.originalName, nameFromUri(payload.contentUri)]) ?? `shared-video-${index + 1}.mp4`;
    return {
      uri: payload.contentUri,
      name,
      mimeType,
      size: payload.contentSize && payload.contentSize > 0 ? payload.contentSize : 0,
      capturedAt: null,
      durationMs: null,
    } satisfies PickedAsset;
  });
}

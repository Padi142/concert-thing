import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library/legacy";
import { createQueueUpload } from "./queueState";
import { insertQueueUpload } from "./db";
import { getCurrentUserId } from "./clerk";
import { capturedAtFromMetadata, embeddedVideoTimestamp } from "./mediaTimestamp";
import type { QueueUpload } from "../types";

export type PickedAsset = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  capturedAt: string | null;
  durationMs: number | null;
};

function mimeTypeForAsset(name: string, mediaType?: string | null): string {
  if (mediaType === "photo") return "image/jpeg";
  if (mediaType === "video") return "video/mp4";
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "mov") return "video/quicktime";
  if (extension === "m4v") return "video/x-m4v";
  return extension === "mp4" ? "video/mp4" : "application/octet-stream";
}

export async function chooseDocuments(): Promise<PickedAsset[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/*", "video/*"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const assets = result.assets ?? [];
  return assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType || mimeTypeForAsset(asset.name),
    size: asset.size ?? 0,
    capturedAt: capturedAtFromMetadata({ modificationTimeMs: asset.lastModified }),
    durationMs: null,
  }));
}

export async function chooseFromPhotoLibrary(): Promise<PickedAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.map(async (asset) => {
    const uri = asset.uri;
    // One unreadable asset must not sink the whole selection.
    const fileInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
    const info = asset.assetId ? await MediaLibrary.getAssetInfoAsync(asset.assetId).catch(() => null) : null;
    const isVideo = asset.type === "video";
    return {
      uri,
      name: asset.fileName || `media-${Date.now()}`,
      mimeType: asset.mimeType || mimeTypeForAsset(asset.fileName || "media", asset.type === "video" ? "video" : "photo"),
      size: fileInfo && "size" in fileInfo && typeof fileInfo.size === "number" ? fileInfo.size : 0,
      capturedAt: capturedAtFromMetadata({
        creationTimeMs: info?.creationTime,
        modificationTimeMs: info?.modificationTime,
        fileModificationTimeSeconds: !isVideo && fileInfo && "modificationTime" in fileInfo ? fileInfo.modificationTime : null,
      }),
      durationMs: asset.duration ?? null,
    } satisfies PickedAsset;
  }));
}

function safeExtension(name: string): string {
  const extension = name.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0].toLowerCase();
  return extension || ".bin";
}

async function copyToOwnedStorage(asset: PickedAsset, id: string): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("App storage is unavailable");
  const queueDirectory = `${root}concert-thing-queue/`;
  await FileSystem.makeDirectoryAsync(queueDirectory, { intermediates: true });
  const destination = `${queueDirectory}${id}${safeExtension(asset.name)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  return destination;
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readRange(localUri: string, start: number, end: number): Promise<Uint8Array> {
  const encoded = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: start,
    length: end - start,
  });
  return decodeBase64(encoded);
}

export type EnqueueProgress = { enqueued: number; failed: number; total: number };
export type EnqueueResult = { queued: QueueUpload[]; failed: number };

async function enqueueAsset(asset: PickedAsset, showId: string | null): Promise<QueueUpload> {
  const accountId = await getCurrentUserId();
  if (!accountId) throw new Error("Sign in before adding media to your archive.");
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let localUri: string | null = null;
  try {
    localUri = await copyToOwnedStorage(asset, id);
    const capturedAt = asset.capturedAt ?? (asset.mimeType.startsWith("video/")
      ? await embeddedVideoTimestamp(asset.size, (start, end) => readRange(localUri!, start, end))
      : null);
    const upload = createQueueUpload({
      id,
      localUri,
      originalName: asset.name,
      contentType: asset.mimeType,
      byteSize: asset.size,
      accountId,
      capturedAt,
      durationMs: asset.durationMs,
      showId,
    });
    await insertQueueUpload(upload);
    return upload;
  } catch (error) {
    if (localUri) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Copies each picked asset into app storage and inserts it into the upload
 * queue. A single unreadable file no longer aborts the batch — failures are
 * counted and reported, and progress is streamed so the caller can surface it
 * (and kick off uploads while later files are still being copied).
 */
export async function enqueueAssets(
  assets: PickedAsset[],
  showId: string | null = null,
  onProgress?: (progress: EnqueueProgress) => void,
): Promise<EnqueueResult> {
  const eligible = assets.filter((asset) => asset.size && (asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/")));
  const queued: QueueUpload[] = [];
  let failed = 0;
  for (const asset of eligible) {
    try {
      queued.push(await enqueueAsset(asset, showId));
    } catch {
      failed += 1;
    }
    onProgress?.({ enqueued: queued.length, failed, total: eligible.length });
  }
  return { queued, failed };
}

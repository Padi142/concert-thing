import { requireOptionalNativeModule } from "expo-modules-core";

export type NativeUploadPartInput = {
  queueId: string;
  url: string;
  fileUri: string;
  byteStart: number;
  byteEnd: number;
  totalBytes: number;
  contentType: string;
  headers: Record<string, string>;
  label: string;
  remainingItems: number;
};

export type NativeUploadPartResult = {
  status: number;
  body: string;
};

type ConcertBackgroundUploadModule = {
  uploadPart(input: NativeUploadPartInput): Promise<NativeUploadPartResult>;
  cancelUpload(queueId: string): Promise<void>;
  sha256File(fileUri: string): Promise<string>;
  startForegroundService(totalItems: number, label: string): Promise<void>;
  updateForegroundService(totalItems: number, label: string, progress: number): Promise<void>;
  stopForegroundService(): Promise<void>;
  requestNotificationPermissionsAsync(): Promise<unknown>;
};

const nativeModule = requireOptionalNativeModule<ConcertBackgroundUploadModule>("ConcertBackgroundUpload");

export function supportsNativeBackgroundUpload(): boolean {
  return nativeModule !== null;
}

export async function uploadPartNatively(input: NativeUploadPartInput): Promise<NativeUploadPartResult | null> {
  return nativeModule?.uploadPart(input) ?? null;
}

export async function cancelNativeUpload(queueId: string): Promise<void> {
  await nativeModule?.cancelUpload(queueId);
}

export async function sha256FileNatively(fileUri: string): Promise<string | null> {
  return nativeModule?.sha256File(fileUri) ?? null;
}

export async function startUploadForegroundService(totalItems: number, label: string): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.requestNotificationPermissionsAsync().catch(() => undefined);
  await nativeModule.startForegroundService(totalItems, label);
}

export async function updateUploadForegroundService(totalItems: number, label: string, progress: number): Promise<void> {
  await nativeModule?.updateForegroundService(totalItems, label, progress);
}

export async function stopUploadForegroundService(): Promise<void> {
  await nativeModule?.stopForegroundService();
}

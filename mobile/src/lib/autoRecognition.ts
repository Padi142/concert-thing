export function shouldAutoRecognizeUpload(
  upload: { contentType: string; mediaId: string | null },
  enabled: boolean,
): boolean {
  return enabled && upload.contentType.startsWith("video/") && Boolean(upload.mediaId);
}

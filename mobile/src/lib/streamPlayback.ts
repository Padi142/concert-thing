export type StreamPlayback = {
  status: string;
  error?: string | null;
  iframeUrl?: string;
  hlsUrl?: string;
  thumbnailUrl?: string;
};

export type StreamPlaybackAction = "ready" | "start" | "poll" | "stop";

export function streamPlaybackAction(playback: StreamPlayback, importRequested: boolean): StreamPlaybackAction {
  if (playback.status === "ready") return "ready";
  if (playback.status === "error") return importRequested ? "stop" : "start";
  if (playback.status === "not_started") return importRequested ? "poll" : "start";
  return "poll";
}

export function normalizeStreamPlayback(playback: StreamPlayback): StreamPlayback {
  if (!playback.iframeUrl || (playback.hlsUrl && playback.thumbnailUrl)) return playback;
  const iframeUrl = new URL(playback.iframeUrl);
  const assetBase = `${iframeUrl.origin}${iframeUrl.pathname.replace(/\/iframe\/?$/, "")}`;
  return {
    ...playback,
    hlsUrl: playback.hlsUrl ?? `${assetBase}/manifest/video.m3u8`,
    thumbnailUrl: playback.thumbnailUrl ?? `${assetBase}/thumbnails/thumbnail.jpg?time=1s&height=480`,
  };
}

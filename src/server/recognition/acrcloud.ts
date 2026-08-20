import type { ProviderMatch, ProviderResult, RecognitionProvider } from "./provider";

type AcrConfig = { accessToken: string; containerId: string; region: string };

type AcrFile = {
  id?: string;
  state?: number;
  results?: { music?: unknown[]; cover_songs?: unknown[]; cover_files?: unknown[] };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMatch(value: unknown, index: number): ProviderMatch | null {
  const wrapper = record(value);
  const match = record(wrapper.result ?? value);
  const title = typeof match.title === "string" ? match.title.trim() : "";
  const artists = Array.isArray(match.artists) ? match.artists.map(artist => record(artist).name).filter((name): name is string => typeof name === "string") : [];
  const artist = artists[0]?.trim() ?? (typeof match.artist === "string" ? match.artist.trim() : "");
  if (!title || !artist) return null;
  const offsetSeconds = finite(wrapper.offset) ?? finite(match.offset) ?? 0;
  const beginMs = finite(match.sample_begin_time_offset_ms) ?? 0;
  const playedSeconds = finite(wrapper.played_duration);
  const startMs = Math.max(0, Math.round(offsetSeconds * 1000 + beginMs));
  const endMs = playedSeconds === null ? null : Math.max(startMs, Math.round((offsetSeconds + playedSeconds) * 1000));
  const externalIds = Object.fromEntries(Object.entries(record(match.external_ids)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const recordingId = typeof match.acrid === "string" ? match.acrid : `${title}:${artist}:${index}`;
  const stableId = `${recordingId}:${Math.round(offsetSeconds * 1000)}`;
  const score = finite(match.score);
  return {
    providerMatchId: stableId,
    startMs,
    endMs,
    confidence: score === null ? null : Math.max(0, Math.min(100, score)),
    title,
    artist,
    externalIds,
  };
}

export class AcrCloudProvider implements RecognitionProvider {
  readonly baseUrl: string;

  constructor(private readonly config: AcrConfig) {
    this.baseUrl = `https://api-${config.region}.acrcloud.com/api/fs-containers/${encodeURIComponent(config.containerId)}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", authorization: `Bearer ${this.config.accessToken}`, ...init.headers },
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`ACRCloud request failed (${response.status})`);
    return value;
  }

  async prepareUpload(filename: string, contentType: string) {
    const params = new URLSearchParams({ filename, content_type: contentType });
    const response = record(await this.request(`/presigned-upload?${params}`));
    const data = record(response.data ?? response);
    if (typeof data.presigned_url !== "string" || typeof data.key !== "string") throw new Error("ACRCloud did not provide an upload URL");
    return { url: data.presigned_url, key: data.key, headers: Object.fromEntries(Object.entries(record(data.headers)).filter((entry): entry is [string, string] => typeof entry[1] === "string")) };
  }

  private async submittedFile(filename: string): Promise<string | null> {
    const params = new URLSearchParams({ search: filename, per_page: "20" });
    const response = record(await this.request(`/files?${params}`));
    const files = Array.isArray(response.data) ? response.data : [];
    const match = files.map(record).find(file => file.name === filename && typeof file.id === "string");
    return typeof match?.id === "string" ? match.id : null;
  }

  async submit(key: string, filename: string) {
    const existingId = await this.submittedFile(filename);
    if (existingId) return { providerJobId: existingId };
    try {
      const response = record(await this.request("/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data_type: "audio", key, filename }),
      }));
      const data = record(response.data ?? response) as AcrFile;
      if (typeof data.id !== "string") throw new Error("ACRCloud did not return a file id");
      return { providerJobId: data.id };
    } catch (error) {
      const recoveredId = await this.submittedFile(filename).catch(() => null);
      if (recoveredId) return { providerJobId: recoveredId };
      throw error;
    }
  }

  async submitUrl(url: string, filename: string) {
    const existingId = await this.submittedFile(filename);
    if (existingId) return { providerJobId: existingId };
    try {
      const response = record(await this.request("/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data_type: "audio_url", url, name: filename }),
      }));
      const data = record(response.data ?? response) as AcrFile;
      if (typeof data.id !== "string") throw new Error("ACRCloud did not return a file id");
      return { providerJobId: data.id };
    } catch (error) {
      const recoveredId = await this.submittedFile(filename).catch(() => null);
      if (recoveredId) return { providerJobId: recoveredId };
      throw error;
    }
  }

  async result(providerJobId: string): Promise<ProviderResult> {
    const response = record(await this.request(`/files/${encodeURIComponent(providerJobId)}`));
    const rawData = response.data ?? response;
    const file = (Array.isArray(rawData) ? rawData[0] : rawData) as AcrFile | undefined;
    if (!file || file.state === 0) return { state: "processing" };
    if (file.state === -1) return { state: "no_match" };
    if (file.state === -2) return { state: "unsupported", message: "ACRCloud could not process this audio" };
    if (file.state !== 1) return { state: "failed", message: "ACRCloud recognition failed" };
    const candidates = [...(file.results?.music ?? []), ...(file.results?.cover_songs ?? []), ...(file.results?.cover_files ?? [])];
    const matches = candidates.map(normalizeMatch).filter((match): match is ProviderMatch => match !== null);
    return matches.length ? { state: "completed", matches } : { state: "no_match" };
  }
}

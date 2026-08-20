export type ProviderMatch = {
  providerMatchId: string;
  startMs: number;
  endMs: number | null;
  confidence: number | null;
  title: string;
  artist: string;
  externalIds: Record<string, string>;
};

export type ProviderResult =
  | { state: "processing" }
  | { state: "completed"; matches: ProviderMatch[] }
  | { state: "no_match" }
  | { state: "unsupported" | "failed"; message: string };

export interface RecognitionProvider {
  prepareUpload(filename: string, contentType: string): Promise<{ url: string; key: string; headers: Record<string, string> }>;
  submit(key: string, filename: string): Promise<{ providerJobId: string }>;
  submitUrl(url: string, filename: string): Promise<{ providerJobId: string }>;
  result(providerJobId: string): Promise<ProviderResult>;
}

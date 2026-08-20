import type { ProviderMatch, ProviderResult, RecognitionProvider } from "./provider";

export class FakeRecognitionProvider implements RecognitionProvider {
  constructor(private readonly matches: ProviderMatch[] = []) {}

  async prepareUpload() {
    return { url: "https://recognition.invalid/upload", key: "fake-audio", headers: { "content-type": "audio/mp4" } };
  }

  async submit() {
    return { providerJobId: "fake-job" };
  }

  async result(): Promise<ProviderResult> {
    return this.matches.length ? { state: "completed", matches: this.matches } : { state: "no_match" };
  }
}

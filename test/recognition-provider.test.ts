import assert from "node:assert/strict";
import { AcrCloudProvider } from "../src/server/recognition/acrcloud";
import { FakeRecognitionProvider } from "../src/server/recognition/fake";
import type { ProviderMatch } from "../src/server/recognition/provider";

const candidate: ProviderMatch = {
  providerMatchId: "song:12000",
  startMs: 12_000,
  endMs: 45_000,
  confidence: 87,
  title: "A Song",
  artist: "An Artist",
  externalIds: { isrc: "EXAMPLE" },
};
const fake = new FakeRecognitionProvider([candidate]);
assert.deepEqual(await fake.result("fake-job"), { state: "completed", matches: [candidate] });

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ data: {
  id: "provider-job",
  state: 1,
  results: { cover_songs: [{ offset: 12, played_duration: 33, result: {
    acrid: "song", title: "A Song", artists: [{ name: "An Artist" }], score: 87,
    sample_begin_time_offset_ms: 500, external_ids: { isrc: "EXAMPLE" },
  } }] },
} }), { headers: { "content-type": "application/json" } });
try {
  const provider = new AcrCloudProvider({ accessToken: "secret", containerId: "42", region: "us-west-2" });
  const result = await provider.result("provider-job");
  assert.equal(result.state, "completed");
  if (result.state === "completed") {
    assert.equal(result.matches[0].providerMatchId, "song:12000");
    assert.equal(result.matches[0].startMs, 12_500);
    assert.equal(result.matches[0].endMs, 45_000);
    assert.equal(result.matches[0].externalIds.isrc, "EXAMPLE");
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("recognition provider adapters: passed");

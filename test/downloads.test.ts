import assert from "node:assert/strict";
import { downloadAndroidApk } from "../src/server/downloads";
import type { Env } from "../src/server/env";

const bytes = new TextEncoder().encode("PK\u0003\u0004apk contents");
const media = {
  async head(key: string) {
    assert.equal(key, "releases/concert-thing-0.1.4.apk");
    return { size: bytes.length, httpEtag: '"apk-etag"' };
  },
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    assert.equal(key, "releases/concert-thing-0.1.4.apk");
    const range = options?.range;
    const body = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
    return { body };
  },
} as unknown as R2Bucket;
const env = { MEDIA: media } as Env;

const response = await downloadAndroidApk(new Request("https://shows.example/downloads/concert-thing.apk"), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get("content-type"), "application/vnd.android.package-archive");
assert.equal(response.headers.get("content-disposition"), 'attachment; filename="concert-thing-0.1.4.apk"');
assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);

const partial = await downloadAndroidApk(new Request("https://shows.example/downloads/concert-thing.apk", {
  headers: { range: "bytes=0-3" },
}), env);
assert.equal(partial.status, 206);
assert.equal(partial.headers.get("content-range"), `bytes 0-3/${bytes.length}`);
assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), bytes.slice(0, 4));

const head = await downloadAndroidApk(new Request("https://shows.example/downloads/concert-thing.apk", { method: "HEAD" }), env);
assert.equal(head.status, 200);
assert.equal(head.headers.get("content-length"), String(bytes.length));
assert.equal((await head.arrayBuffer()).byteLength, 0);

console.log("download tests passed");

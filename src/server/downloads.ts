import type { Env } from "./env";
import { HttpError } from "./http";
import { parseRange } from "./media";

const ANDROID_APK_KEY = "releases/concert-thing-0.1.4.apk";
const ANDROID_APK_NAME = "concert-thing-0.1.4.apk";

export async function downloadAndroidApk(request: Request, env: Env): Promise<Response> {
  const head = await env.MEDIA.head(ANDROID_APK_KEY);
  if (!head) throw new HttpError(404, "Android app is not available");

  const range = parseRange(request.headers.get("range"), head.size);
  const object = request.method === "HEAD"
    ? null
    : await env.MEDIA.get(ANDROID_APK_KEY, range ? { range } : undefined);
  if (request.method !== "HEAD" && !object) throw new HttpError(404, "Android app is not available");

  const headers = new Headers({
    "accept-ranges": "bytes",
    // This stable URL always points at the newest APK, so clients must not
    // reuse a previously downloaded release after an update.
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="${ANDROID_APK_NAME}"`,
    "content-length": String(range?.length ?? head.size),
    "content-type": "application/vnd.android.package-archive",
    "etag": head.httpEtag,
    "x-content-type-options": "nosniff",
  });
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);

  return new Response(object?.body ?? null, { status: range ? 206 : 200, headers });
}

import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { authenticate } from "../src/server/auth";
import type { Env } from "../src/server/env";
import { HttpError } from "../src/server/http";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
  CLERK_AUTHORIZED_PARTIES: "https://archive.example",
} as Env;

function token(azp?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "user_1",
    sid: "session_1",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...(azp ? { azp } : {}),
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

function request(value: string, withCookie: boolean): Request {
  const headers = new Headers({ authorization: `Bearer ${value}` });
  if (withCookie) headers.set("cookie", `__session=${encodeURIComponent(value)}`);
  return new Request("https://archive.example/api/shows", { headers });
}

assert.deepEqual(await authenticate(request(token(), false), env), { userId: "user_1" });
await assert.rejects(
  () => authenticate(request(token(), true), env),
  (error: unknown) => error instanceof HttpError && error.status === 401,
);
await assert.rejects(
  () => authenticate(request(token("https://other.example"), false), env),
  (error: unknown) => error instanceof HttpError && error.status === 401,
);
assert.deepEqual(await authenticate(request(token("https://archive.example"), true), env), { userId: "user_1" });

console.log("auth tests passed");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const value = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(typeof value.error === "string" ? value.error : `Request failed (${response.status})`, response.status, value);
  return value as T;
}

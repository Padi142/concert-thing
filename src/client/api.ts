export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`);
  return value as T;
}

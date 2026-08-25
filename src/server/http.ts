type Json = Record<string, unknown> | unknown[];
export type HttpErrorDetails = Record<string, unknown>;

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details: HttpErrorDetails = {}) {
    super(message);
  }
}

export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(value: Json, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

export function errorBody(error: HttpError): Record<string, unknown> {
  return { error: error.message, ...error.details };
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "A JSON object is required");
  }
}

export function text(value: unknown, name: string, required = true): string {
  if (typeof value !== "string" || (required && !value.trim())) {
    throw new HttpError(400, `${name} is required`);
  }
  return value.trim();
}

export const API_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(API_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

export function methodNotAllowed(allow: string): Response {
  const response = apiError(405, 'method_not_allowed', 'Method not allowed.');
  response.headers.set('Allow', allow);
  return response;
}

export async function readJson<T>(request: Request, maxBytes = 12_000): Promise<T> {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > maxBytes) throw new Error('payload_too_large');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new Error('payload_too_large');
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('invalid_json');
  }
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

export function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

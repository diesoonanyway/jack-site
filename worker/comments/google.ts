type GoogleJwk = JsonWebKey & { kid?: string; alg?: string };

type GoogleJwkResponse = {
  keys?: GoogleJwk[];
};

type GoogleIdTokenPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  name?: string;
};

export type VerifiedGoogleIdentity = {
  sub: string;
  name: string;
};

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

let cachedKeys: GoogleJwk[] = [];
let cachedKeysExpireAt = 0;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function getMaxAge(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) : 3600;
}

async function getGoogleKeys(fetcher: typeof fetch, forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && cachedKeys.length > 0 && cachedKeysExpireAt > Date.now()) return cachedKeys;

  const response = await fetcher(GOOGLE_JWKS_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('google_keys_unavailable');

  const body = await response.json() as GoogleJwkResponse;
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('google_keys_invalid');
  }

  cachedKeys = body.keys;
  cachedKeysExpireAt = Date.now() + getMaxAge(response.headers.get('Cache-Control')) * 1000;
  return cachedKeys;
}

export function clearGoogleKeyCacheForTests(): void {
  cachedKeys = [];
  cachedKeysExpireAt = 0;
}

export async function verifyGoogleIdToken(
  token: string,
  expectedClientId: string,
  fetcher: typeof fetch = fetch,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifiedGoogleIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_google_token');

  let header: { alg?: string; kid?: string };
  let payload: GoogleIdTokenPayload;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch {
    throw new Error('invalid_google_token');
  }

  if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_google_token');

  let keys = await getGoogleKeys(fetcher);
  let jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    keys = await getGoogleKeys(fetcher, true);
    jwk = keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk) throw new Error('invalid_google_token');

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signedValue = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = decodeBase64Url(parts[2]);
  const validSignature = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    signedValue,
  );

  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const validClaims =
    validSignature &&
    GOOGLE_ISSUERS.has(payload.iss || '') &&
    audience.includes(expectedClientId) &&
    typeof payload.exp === 'number' &&
    payload.exp > nowSeconds &&
    typeof payload.sub === 'string' &&
    payload.sub.length > 0;

  if (!validClaims) throw new Error('invalid_google_token');

  const name = typeof payload.name === 'string'
    ? payload.name.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    : '';
  return {
    sub: payload.sub,
    name: name.slice(0, 120) || 'Google user',
  };
}

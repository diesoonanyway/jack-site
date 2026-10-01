import assert from 'node:assert/strict';
import test from 'node:test';
import { clearGoogleKeyCacheForTests, verifyGoogleIdToken } from './google.ts';

const encoder = new TextEncoder();

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64url');
}

async function createFixture(audience = 'expected-client.apps.googleusercontent.com') {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const header = encode({ alg: 'RS256', kid: 'test-key' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: audience,
    exp: 2_000_000_000,
    iat: 1_900_000_000,
    sub: 'google-subject-123',
    name: 'Test Person',
  });
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keys.privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  const token = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  const fetcher = async () => new Response(JSON.stringify({
    keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }],
  }), { headers: { 'Cache-Control': 'max-age=60' } });
  return { token, fetcher: fetcher as typeof fetch };
}

test('verifies signature, issuer, audience, expiration, and returns only stable identity fields', async () => {
  clearGoogleKeyCacheForTests();
  const fixture = await createFixture();
  const identity = await verifyGoogleIdToken(
    fixture.token,
    'expected-client.apps.googleusercontent.com',
    fixture.fetcher,
    1_950_000_000,
  );
  assert.deepEqual(identity, { sub: 'google-subject-123', name: 'Test Person' });
});

test('rejects a token issued for another Google client ID', async () => {
  clearGoogleKeyCacheForTests();
  const fixture = await createFixture('other-client.apps.googleusercontent.com');
  await assert.rejects(
    verifyGoogleIdToken(
      fixture.token,
      'expected-client.apps.googleusercontent.com',
      fixture.fetcher,
      1_950_000_000,
    ),
    /invalid_google_token/,
  );
});

test('rejects malformed and expired tokens', async () => {
  await assert.rejects(
    verifyGoogleIdToken('not-a-token', 'expected-client.apps.googleusercontent.com'),
    /invalid_google_token/,
  );

  clearGoogleKeyCacheForTests();
  const fixture = await createFixture();
  await assert.rejects(
    verifyGoogleIdToken(
      fixture.token,
      'expected-client.apps.googleusercontent.com',
      fixture.fetcher,
      2_100_000_000,
    ),
    /invalid_google_token/,
  );
});

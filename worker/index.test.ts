import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.ts';

const createEnv = (assetResponse = new Response('asset response')) => ({
  ASSETS: {
    async fetch() {
      return assetResponse;
    },
  },
});

const createRequest = (
  path: string,
  init?: RequestInit,
  cf?: { country?: string | null; isEUCountry?: string | boolean | null },
) => {
  const request = new Request(`https://ifitallends.com${path}`, init);
  Object.defineProperty(request, 'cf', { value: cf });
  return request;
};

test('returns only the regulated flag with private no-store headers', async () => {
  const response = await worker.fetch(
    createRequest('/api/privacy-region', undefined, { country: 'GB' }),
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), { regulated: true });
});

test('returns null when local requests do not include Cloudflare region data', async () => {
  const response = await worker.fetch(
    createRequest('/api/privacy-region'),
    createEnv(),
  );

  assert.deepEqual(await response.json(), { regulated: null });
});

test('rejects methods other than GET', async () => {
  const response = await worker.fetch(
    createRequest('/api/privacy-region', { method: 'POST' }, { country: 'AU' }),
    createEnv(),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
});

test('passes every other path through the ASSETS binding', async () => {
  const expected = new Response('homepage asset');
  const response = await worker.fetch(
    createRequest('/'),
    createEnv(expected),
  );

  assert.equal(response, expected);
});

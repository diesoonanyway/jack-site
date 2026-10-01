import assert from 'node:assert/strict';
import test from 'node:test';
import { clearArticleKeyCacheForTests, handleCommentsRequest } from './router.ts';
import type { CommentsEnv, D1Database, D1PreparedStatement } from './types.ts';

function createStatement(firstValue: Record<string, unknown> | null = null): D1PreparedStatement {
  return {
    bind() { return this; },
    async first<T>() { return firstValue as T | null; },
    async all<T>() { return { success: true, results: [] as T[] }; },
    async run<T>() { return { success: true, results: [] as T[] }; },
  };
}

function createDb(
  session: Record<string, unknown> | null = null,
  counts: Record<string, unknown> | null = null,
): D1Database {
  return {
    prepare(query) { return createStatement(query.includes('SUM(CASE') ? counts : session); },
    async batch<T>() { return [{ success: true, results: [] as T[] }]; },
  };
}

function createEnv(
  session: Record<string, unknown> | null = null,
  adminGoogleSub?: string,
  articleKeys: string[] = [],
  counts: Record<string, unknown> | null = null,
): CommentsEnv {
  return {
    GOOGLE_CLIENT_ID: 'expected-client.apps.googleusercontent.com',
    ADMIN_GOOGLE_SUB: adminGoogleSub,
    COMMENTS_DB: createDb(session, counts),
    ASSETS: { async fetch() { return Response.json({ keys: articleKeys }); } },
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://ifitallends.com${path}`, init);
}

test('rejects an unauthenticated comment write', async () => {
  const response = await handleCommentsRequest(request('/api/comments', {
    method: 'POST',
    headers: { Origin: 'https://ifitallends.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ section: 'what-i-feel', slug: 'example', lang: 'en', body: 'Hello' }),
  }), createEnv());
  assert.equal(response?.status, 401);
  assert.equal((await response?.json()).error.code, 'authentication_required');
});

test('rejects a malformed Google credential before touching user data', async () => {
  const loginCsrf = 'a-secure-login-csrf-token-with-enough-length';
  const response = await handleCommentsRequest(request('/api/auth/google', {
    method: 'POST',
    headers: {
      Origin: 'https://ifitallends.com',
      Cookie: `__Host-ifitallends_login_csrf=${loginCsrf}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credential: 'malformed', loginCsrf }),
  }), createEnv());
  assert.equal(response?.status, 401);
  assert.equal((await response?.json()).error.code, 'invalid_google_token');
});

test('rejects a non-admin session from administrator APIs', async () => {
  const response = await handleCommentsRequest(request('/api/admin/comments', {
    headers: { Cookie: '__Host-ifitallends_comments=session-token' },
  }), createEnv({
    session_id: 'hashed-session', csrf_token: 'csrf-token', user_id: 3,
    google_sub: 'ordinary-user', display_name: 'Ordinary User', is_blocked: 0,
  }));
  assert.equal(response?.status, 403);
  assert.equal((await response?.json()).error.code, 'admin_required');
});

test('rejects a blocked user even while an existing session remains valid', async () => {
  const response = await handleCommentsRequest(request('/api/comments', {
    method: 'POST',
    headers: {
      Origin: 'https://ifitallends.com',
      Cookie: '__Host-ifitallends_comments=session-token',
      'X-CSRF-Token': 'csrf-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ section: 'what-i-feel', slug: 'example', lang: 'en', body: 'Hello' }),
  }), createEnv({
    session_id: 'hashed-session', csrf_token: 'csrf-token', user_id: 5,
    google_sub: 'blocked-user', display_name: 'Blocked User', is_blocked: 1,
  }));
  assert.equal(response?.status, 403);
  assert.equal((await response?.json()).error.code, 'user_blocked');
});

test('rejects cross-origin mutation requests', async () => {
  const response = await handleCommentsRequest(request('/api/comments', {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: '{}',
  }), createEnv());
  assert.equal(response?.status, 403);
  assert.equal((await response?.json()).error.code, 'invalid_origin');
});

test('rejects a forged authenticated mutation without the session CSRF token', async () => {
  const response = await handleCommentsRequest(request('/api/comments', {
    method: 'POST',
    headers: {
      Origin: 'https://ifitallends.com',
      Cookie: '__Host-ifitallends_comments=session-token',
      'X-CSRF-Token': 'wrong-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ section: 'what-i-feel', slug: 'example', lang: 'en', body: 'Hello' }),
  }), createEnv({
    session_id: 'hashed-session', csrf_token: 'csrf-token', user_id: 8,
    google_sub: 'normal-user', display_name: 'Normal User', is_blocked: 0,
  }));
  assert.equal(response?.status, 403);
  assert.equal((await response?.json()).error.code, 'invalid_csrf');
});

test('rejects comments for a target absent from the published article manifest', async () => {
  clearArticleKeyCacheForTests();
  const response = await handleCommentsRequest(request('/api/comments', {
    method: 'POST',
    headers: {
      Origin: 'https://ifitallends.com',
      Cookie: '__Host-ifitallends_comments=session-token',
      'X-CSRF-Token': 'csrf-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ section: 'what-i-learn', slug: 'not-published', lang: 'ko', body: 'Hello' }),
  }), createEnv({
    session_id: 'hashed-session', csrf_token: 'csrf-token', user_id: 9,
    google_sub: 'normal-user', display_name: 'Normal User', is_blocked: 0,
  }));
  assert.equal(response?.status, 404);
  assert.equal((await response?.json()).error.code, 'article_not_found');
});

test('rate-limits a signed-in user after three comments in one minute', async () => {
  clearArticleKeyCacheForTests();
  const response = await handleCommentsRequest(request('/api/comments', {
    method: 'POST',
    headers: {
      Origin: 'https://ifitallends.com',
      Cookie: '__Host-ifitallends_comments=session-token',
      'X-CSRF-Token': 'csrf-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ section: 'what-i-feel', slug: 'published', lang: 'en', body: 'Hello' }),
  }), createEnv({
    session_id: 'hashed-session', csrf_token: 'csrf-token', user_id: 11,
    google_sub: 'frequent-user', display_name: 'Frequent User', is_blocked: 0,
  }, undefined, ['what-i-feel:published:en'], {
    minute_count: 3, day_count: 3, duplicate_count: 0,
  }));
  assert.equal(response?.status, 429);
  assert.equal((await response?.json()).error.code, 'rate_limited');
});

test('allows the configured Google subject to read administrator data', async () => {
  const response = await handleCommentsRequest(request('/api/admin/comments', {
    headers: { Cookie: '__Host-ifitallends_comments=session-token' },
  }), createEnv({
    session_id: 'hashed-session', csrf_token: 'csrf-token', user_id: 1,
    google_sub: 'configured-admin', display_name: 'Site Owner', is_blocked: 0,
  }, 'configured-admin'));
  assert.equal(response?.status, 200);
  assert.deepEqual(await response?.json(), { comments: [], nextCursor: null });
});

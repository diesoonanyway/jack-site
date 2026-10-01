import { verifyGoogleIdToken } from './google.ts';
import {
  apiError,
  hasSameOrigin,
  json,
  methodNotAllowed,
  randomToken,
  readJson,
} from './http.ts';
import {
  clearCookie,
  createLoginCsrfCookie,
  createSessionCookie,
  getSessionUser,
  issueSession,
  LOGIN_CSRF_COOKIE,
  SESSION_COOKIE,
  validateLoginCsrf,
  validateSessionCsrf,
} from './session.ts';
import type { CommentsEnv, SessionUser } from './types.ts';
import {
  COMMENT_MAX_LENGTH,
  normalizeCommentBody,
  parseCommentTarget,
  type CommentTarget,
} from './validation.ts';

type CommentRow = {
  id: number;
  body: string;
  created_at: number;
  display_name: string;
  deleted_at?: number | null;
  section?: string;
  slug?: string;
  lang?: string;
  user_id?: number;
};

type CountRow = {
  minute_count: number | null;
  day_count: number | null;
  duplicate_count: number | null;
};

type UserRow = {
  id: number;
};

type BlockedUserRow = {
  id: number;
  display_name: string;
  updated_at: number;
};

const PAGE_SIZE = 20;
const ARTICLE_INDEX_PATH = '/api/commentable-articles.json';
let cachedArticleKeys: Set<string> | null = null;
let articleKeysExpireAt = 0;

export function clearArticleKeyCacheForTests(): void {
  cachedArticleKeys = null;
  articleKeysExpireAt = 0;
}

function isConfigured(env: CommentsEnv): boolean {
  return Boolean(env.COMMENTS_DB && env.GOOGLE_CLIENT_ID);
}

function requireConfigured(env: CommentsEnv): Response | null {
  return isConfigured(env)
    ? null
    : apiError(503, 'comments_unavailable', 'Comments are not configured yet.')
}

function requireSameOrigin(request: Request): Response | null {
  return hasSameOrigin(request)
    ? null
    : apiError(403, 'invalid_origin', 'This request did not come from this site.')
}

async function requireSession(
  request: Request,
  env: CommentsEnv,
): Promise<SessionUser | Response> {
  const session = await getSessionUser(request, env);
  return session || apiError(401, 'authentication_required', 'Google sign-in is required.');
}

function requireMutationCsrf(request: Request, session: SessionUser): Response | null {
  return validateSessionCsrf(request, session)
    ? null
    : apiError(403, 'invalid_csrf', 'The security token is invalid or expired.');
}

function articleKey(target: CommentTarget): string {
  return `${target.section}:${target.slug}:${target.lang}`;
}

async function getArticleKeys(request: Request, env: CommentsEnv): Promise<Set<string>> {
  if (cachedArticleKeys && articleKeysExpireAt > Date.now()) return cachedArticleKeys;

  const manifestUrl = new URL(ARTICLE_INDEX_PATH, request.url);
  const response = await env.ASSETS.fetch(new Request(manifestUrl, { method: 'GET' }));
  if (!response.ok) throw new Error('article_manifest_unavailable');

  const payload = await response.json() as { keys?: unknown };
  if (!Array.isArray(payload.keys) || !payload.keys.every((key) => typeof key === 'string')) {
    throw new Error('article_manifest_invalid');
  }

  cachedArticleKeys = new Set(payload.keys);
  articleKeysExpireAt = Date.now() + 5 * 60 * 1000;
  return cachedArticleKeys;
}

async function articleExists(
  request: Request,
  env: CommentsEnv,
  target: CommentTarget,
): Promise<boolean> {
  return (await getArticleKeys(request, env)).has(articleKey(target));
}

function serializeComment(row: CommentRow) {
  return {
    id: row.id,
    author: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function getCursor(url: URL): number | null {
  const value = url.searchParams.get('cursor');
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function handleConfig(request: Request, env: CommentsEnv): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  return json({
    enabled: isConfigured(env),
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    maxLength: COMMENT_MAX_LENGTH,
  });
}

async function handleLoginCsrf(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const token = randomToken(24);
  const response = json({ token });
  response.headers.append('Set-Cookie', createLoginCsrfCookie(token));
  return response;
}

async function handleGoogleLogin(request: Request, env: CommentsEnv): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const configurationError = requireConfigured(env);
  if (configurationError) return configurationError;
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let body: { credential?: unknown; loginCsrf?: unknown };
  try {
    body = await readJson(request);
  } catch (error) {
    return apiError(
      error instanceof Error && error.message === 'payload_too_large' ? 413 : 400,
      'invalid_request',
      'The sign-in request is invalid.',
    );
  }

  if (!validateLoginCsrf(request, body.loginCsrf) || typeof body.credential !== 'string') {
    return apiError(403, 'invalid_csrf', 'The sign-in request is invalid or expired.');
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID!);
  } catch {
    return apiError(401, 'invalid_google_token', 'Google could not verify this sign-in.');
  }

  const now = Math.floor(Date.now() / 1000);
  await env.COMMENTS_DB!.prepare(`
    INSERT INTO comment_users (google_sub, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `).bind(identity.sub, identity.name, now, now).run();

  const user = await env.COMMENTS_DB!.prepare(
    'SELECT id FROM comment_users WHERE google_sub = ? LIMIT 1',
  ).bind(identity.sub).first<UserRow>();
  if (!user) return apiError(500, 'login_failed', 'The account could not be saved.');

  const session = await issueSession(env, user.id);
  const response = json({ ok: true });
  response.headers.append('Set-Cookie', createSessionCookie(session.token));
  response.headers.append('Set-Cookie', clearCookie(LOGIN_CSRF_COOKIE));
  return response;
}

async function handleAuthSession(request: Request, env: CommentsEnv): Promise<Response> {
  const configurationError = requireConfigured(env);
  if (configurationError) return configurationError;

  if (request.method === 'GET') {
    const session = await getSessionUser(request, env);
    if (!session) return json({ authenticated: false });
    return json({
      authenticated: true,
      user: { name: session.displayName },
      admin: session.admin,
      blocked: session.blocked,
      csrfToken: session.csrfToken,
    });
  }

  if (request.method === 'DELETE') {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const sessionOrResponse = await requireSession(request, env);
    if (sessionOrResponse instanceof Response) return sessionOrResponse;
    const csrfError = requireMutationCsrf(request, sessionOrResponse);
    if (csrfError) return csrfError;

    await env.COMMENTS_DB!.prepare('DELETE FROM comment_sessions WHERE id = ?')
      .bind(sessionOrResponse.sessionId)
      .run();
    const response = json({ ok: true });
    response.headers.append('Set-Cookie', clearCookie(SESSION_COOKIE, true));
    return response;
  }

  return methodNotAllowed('GET, DELETE');
}

async function handleCommentList(request: Request, env: CommentsEnv, url: URL): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const configurationError = requireConfigured(env);
  if (configurationError) return configurationError;

  const target = parseCommentTarget({
    section: url.searchParams.get('section'),
    slug: url.searchParams.get('slug'),
    lang: url.searchParams.get('lang'),
  });
  if (!target) return apiError(400, 'invalid_target', 'The article reference is invalid.');

  try {
    if (!(await articleExists(request, env, target))) {
      return apiError(404, 'article_not_found', 'This published article was not found.');
    }
  } catch {
    return apiError(503, 'article_validation_unavailable', 'The article could not be verified.');
  }

  const cursor = getCursor(url);
  const cursorSql = cursor ? 'AND c.id < ?' : '';
  const statement = env.COMMENTS_DB!.prepare(`
    SELECT c.id, c.body, c.created_at, u.display_name
    FROM comments c
    JOIN comment_users u ON u.id = c.user_id
    WHERE c.section = ? AND c.slug = ? AND c.lang = ?
      AND c.deleted_at IS NULL ${cursorSql}
    ORDER BY c.id DESC
    LIMIT ?
  `);
  const values: unknown[] = [target.section, target.slug, target.lang];
  if (cursor) values.push(cursor);
  values.push(PAGE_SIZE + 1);
  const result = await statement.bind(...values).all<CommentRow>();
  const rows = result.results || [];
  const hasMore = rows.length > PAGE_SIZE;
  const visibleRows = rows.slice(0, PAGE_SIZE);

  return json({
    comments: visibleRows.map(serializeComment),
    nextCursor: hasMore ? visibleRows.at(-1)?.id || null : null,
  });
}

async function handleCommentCreate(request: Request, env: CommentsEnv): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const configurationError = requireConfigured(env);
  if (configurationError) return configurationError;
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const sessionOrResponse = await requireSession(request, env);
  if (sessionOrResponse instanceof Response) return sessionOrResponse;
  const csrfError = requireMutationCsrf(request, sessionOrResponse);
  if (csrfError) return csrfError;
  if (sessionOrResponse.blocked) {
    return apiError(403, 'user_blocked', 'This account cannot post comments.');
  }

  let payload: { section?: unknown; slug?: unknown; lang?: unknown; body?: unknown };
  try {
    payload = await readJson(request, 8_000);
  } catch (error) {
    return apiError(
      error instanceof Error && error.message === 'payload_too_large' ? 413 : 400,
      'invalid_request',
      'The comment request is invalid.',
    );
  }

  const target = parseCommentTarget(payload);
  const commentBody = normalizeCommentBody(payload.body);
  if (!target || !commentBody) {
    return apiError(400, 'invalid_comment', `Comments must be 1-${COMMENT_MAX_LENGTH} characters.`);
  }

  try {
    if (!(await articleExists(request, env, target))) {
      return apiError(404, 'article_not_found', 'Comments are only available on published articles.');
    }
  } catch {
    return apiError(503, 'article_validation_unavailable', 'The article could not be verified.');
  }

  const now = Math.floor(Date.now() / 1000);
  const counts = await env.COMMENTS_DB!.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS minute_count,
      COUNT(*) AS day_count,
      SUM(CASE WHEN created_at >= ? AND body = ? THEN 1 ELSE 0 END) AS duplicate_count
    FROM comments
    WHERE user_id = ? AND created_at >= ?
  `).bind(now - 60, now - 600, commentBody, sessionOrResponse.userId, now - 86_400)
    .first<CountRow>();

  if ((counts?.minute_count || 0) >= 3 || (counts?.day_count || 0) >= 20) {
    return apiError(429, 'rate_limited', 'Please wait before posting another comment.');
  }
  if ((counts?.duplicate_count || 0) > 0) {
    return apiError(409, 'duplicate_comment', 'This comment was already submitted recently.');
  }

  const inserted = await env.COMMENTS_DB!.prepare(`
    INSERT INTO comments (section, slug, lang, user_id, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    target.section,
    target.slug,
    target.lang,
    sessionOrResponse.userId,
    commentBody,
    now,
  ).run();
  const commentId = inserted.meta?.last_row_id;
  if (!commentId) return apiError(500, 'comment_failed', 'The comment could not be saved.');

  return json({
    comment: serializeComment({
      id: commentId,
      body: commentBody,
      created_at: now,
      display_name: sessionOrResponse.displayName,
    }),
  }, { status: 201 });
}

async function requireAdmin(
  request: Request,
  env: CommentsEnv,
): Promise<SessionUser | Response> {
  const configurationError = requireConfigured(env);
  if (configurationError) return configurationError;
  const sessionOrResponse = await requireSession(request, env);
  if (sessionOrResponse instanceof Response) return sessionOrResponse;
  if (!sessionOrResponse.admin) {
    return apiError(403, 'admin_required', 'Administrator access is required.');
  }
  return sessionOrResponse;
}

async function handleAdminComments(request: Request, env: CommentsEnv, url: URL): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const cursor = getCursor(url);
  const cursorSql = cursor ? 'WHERE c.id < ?' : '';
  const statement = env.COMMENTS_DB!.prepare(`
    SELECT
      c.id, c.section, c.slug, c.lang, c.body, c.created_at, c.deleted_at, c.user_id,
      u.display_name
    FROM comments c
    JOIN comment_users u ON u.id = c.user_id
    ${cursorSql}
    ORDER BY c.id DESC
    LIMIT ?
  `);
  const result = await (cursor
    ? statement.bind(cursor, PAGE_SIZE + 1)
    : statement.bind(PAGE_SIZE + 1)
  ).all<CommentRow>();
  const rows = result.results || [];
  const hasMore = rows.length > PAGE_SIZE;
  const visibleRows = rows.slice(0, PAGE_SIZE);

  return json({
    comments: visibleRows.map((row) => ({
      id: row.id,
      section: row.section,
      slug: row.slug,
      lang: row.lang,
      author: row.display_name,
      userId: row.user_id,
      body: row.body,
      createdAt: row.created_at,
      deleted: Boolean(row.deleted_at),
    })),
    nextCursor: hasMore ? visibleRows.at(-1)?.id || null : null,
  });
}

async function handleAdminCommentDelete(
  request: Request,
  env: CommentsEnv,
  id: number,
): Promise<Response> {
  if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const csrfError = requireMutationCsrf(request, admin);
  if (csrfError) return csrfError;

  await env.COMMENTS_DB!.prepare(
    'UPDATE comments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
  ).bind(Math.floor(Date.now() / 1000), id).run();
  return json({ ok: true });
}

async function handleBlockedUsers(request: Request, env: CommentsEnv): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const result = await env.COMMENTS_DB!.prepare(`
    SELECT id, display_name, updated_at
    FROM comment_users
    WHERE is_blocked = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT 200
  `).all<BlockedUserRow>();
  return json({
    users: (result.results || []).map((user) => ({
      id: user.id,
      name: user.display_name,
      updatedAt: user.updated_at,
    })),
  });
}

async function handleUserBlock(
  request: Request,
  env: CommentsEnv,
  userId: number,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const csrfError = requireMutationCsrf(request, admin);
  if (csrfError) return csrfError;
  if (admin.userId === userId) {
    return apiError(400, 'cannot_block_self', 'The active administrator cannot block itself.');
  }

  let payload: { blocked?: unknown };
  try {
    payload = await readJson(request, 1_000);
  } catch {
    return apiError(400, 'invalid_request', 'The block request is invalid.');
  }
  if (typeof payload.blocked !== 'boolean') {
    return apiError(400, 'invalid_request', 'A blocked boolean is required.');
  }

  await env.COMMENTS_DB!.prepare(
    'UPDATE comment_users SET is_blocked = ?, updated_at = ? WHERE id = ?',
  ).bind(payload.blocked ? 1 : 0, Math.floor(Date.now() / 1000), userId).run();
  return json({ ok: true, blocked: payload.blocked });
}

export async function handleCommentsRequest(
  request: Request,
  env: CommentsEnv,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === '/api/comments/config') return handleConfig(request, env);
  if (url.pathname === '/api/auth/csrf') return handleLoginCsrf(request);
  if (url.pathname === '/api/auth/google') return handleGoogleLogin(request, env);
  if (url.pathname === '/api/auth/session') return handleAuthSession(request, env);
  if (url.pathname === '/api/comments') {
    return request.method === 'POST'
      ? handleCommentCreate(request, env)
      : handleCommentList(request, env, url);
  }
  if (url.pathname === '/api/admin/comments') return handleAdminComments(request, env, url);
  if (url.pathname === '/api/admin/blocked') return handleBlockedUsers(request, env);

  const commentDeleteMatch = url.pathname.match(/^\/api\/admin\/comments\/(\d+)$/);
  if (commentDeleteMatch) {
    return handleAdminCommentDelete(request, env, Number(commentDeleteMatch[1]));
  }
  const userBlockMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/block$/);
  if (userBlockMatch) {
    return handleUserBlock(request, env, Number(userBlockMatch[1]));
  }

  return null;
}

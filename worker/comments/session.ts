import { parseCookies, randomToken, sha256 } from './http.ts';
import type { CommentsEnv, SessionUser } from './types.ts';

export const SESSION_COOKIE = '__Host-ifitallends_comments';
export const LOGIN_CSRF_COOKIE = '__Host-ifitallends_login_csrf';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionRow = {
  session_id: string;
  csrf_token: string;
  user_id: number;
  google_sub: string;
  display_name: string;
  is_blocked: number;
};

export function createCookie(name: string, value: string, options = ''): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; SameSite=Lax${options}`;
}

export function clearCookie(name: string, httpOnly = false): string {
  return createCookie(name, '', `; Max-Age=0${httpOnly ? '; HttpOnly' : ''}`);
}

export function createLoginCsrfCookie(token: string): string {
  return createCookie(LOGIN_CSRF_COOKIE, token, '; Max-Age=600');
}

export function createSessionCookie(token: string): string {
  return createCookie(SESSION_COOKIE, token, `; HttpOnly; Max-Age=${SESSION_TTL_SECONDS}`);
}

export function validateLoginCsrf(request: Request, submittedToken: unknown): boolean {
  if (typeof submittedToken !== 'string' || submittedToken.length < 20) return false;
  return parseCookies(request).get(LOGIN_CSRF_COOKIE) === submittedToken;
}

export async function getSessionUser(
  request: Request,
  env: CommentsEnv,
): Promise<SessionUser | null> {
  if (!env.COMMENTS_DB) return null;
  const rawToken = parseCookies(request).get(SESSION_COOKIE);
  if (!rawToken) return null;

  const sessionId = await sha256(rawToken);
  const row = await env.COMMENTS_DB.prepare(`
    SELECT
      s.id AS session_id,
      s.csrf_token,
      u.id AS user_id,
      u.google_sub,
      u.display_name,
      u.is_blocked
    FROM comment_sessions s
    JOIN comment_users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(sessionId, Math.floor(Date.now() / 1000)).first<SessionRow>();

  if (!row) return null;
  return {
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
    userId: row.user_id,
    googleSub: row.google_sub,
    displayName: row.display_name,
    blocked: row.is_blocked === 1,
    admin: Boolean(env.ADMIN_GOOGLE_SUB && row.google_sub === env.ADMIN_GOOGLE_SUB),
  };
}

export async function issueSession(
  env: CommentsEnv,
  userId: number,
): Promise<{ token: string; csrfToken: string }> {
  if (!env.COMMENTS_DB) throw new Error('comments_not_configured');
  const token = randomToken();
  const sessionId = await sha256(token);
  const csrfToken = randomToken(24);
  const now = Math.floor(Date.now() / 1000);

  await env.COMMENTS_DB.batch([
    env.COMMENTS_DB.prepare('DELETE FROM comment_sessions WHERE expires_at <= ?').bind(now),
    env.COMMENTS_DB.prepare(`
      INSERT INTO comment_sessions (id, user_id, csrf_token, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(sessionId, userId, csrfToken, now, now + SESSION_TTL_SECONDS),
  ]);

  return { token, csrfToken };
}

export function validateSessionCsrf(request: Request, session: SessionUser): boolean {
  const token = request.headers.get('X-CSRF-Token');
  return Boolean(token && token === session.csrfToken);
}

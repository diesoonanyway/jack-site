PRAGMA foreign_keys = ON;

CREATE TABLE comment_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_blocked INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE comment_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES comment_users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL CHECK (section IN ('what-i-feel', 'what-i-learn')),
  slug TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'ko')),
  user_id INTEGER NOT NULL REFERENCES comment_users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX idx_comment_sessions_expires
  ON comment_sessions(expires_at);

CREATE INDEX idx_comments_article
  ON comments(section, slug, lang, deleted_at, id DESC);

CREATE INDEX idx_comments_user_created
  ON comments(user_id, created_at DESC);

CREATE INDEX idx_comment_users_blocked
  ON comment_users(is_blocked, id);

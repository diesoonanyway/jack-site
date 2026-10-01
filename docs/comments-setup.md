# Google comments setup

The comments code is intentionally disabled until both a Google web client ID and a Cloudflare D1 binding exist. No production database, OAuth client, secret, migration, or deployment is created by the repository changes alone.

## 1. Create the Google web client

1. In Google Cloud Console, configure the OAuth consent screen for the site.
2. Create an **OAuth 2.0 Client ID** with application type **Web application**.
3. Add the production origin `https://ifitallends.com` to **Authorized JavaScript origins**. Add `http://localhost:4321` only when local browser testing is needed.
4. Copy the client ID. This implementation uses Google Identity Services ID tokens and does not require a client secret or a redirect URI.

The Worker verifies every ID token's RS256 signature against Google's published keys, then checks `iss`, `aud`, `exp`, and `sub`. The client ID must therefore be exactly the one configured for this site.

## 2. Create and bind D1

Create the production D1 database yourself in Cloudflare. Do not substitute a made-up ID. After Cloudflare supplies the real values, add this block to `wrangler.toml` or configure the equivalent D1 binding in the Cloudflare dashboard used by the Git deployment:

```toml
[[d1_databases]]
binding = "COMMENTS_DB"
database_name = "<YOUR_D1_DATABASE_NAME>"
database_id = "<YOUR_REAL_D1_DATABASE_ID>"
migrations_dir = "migrations"
```

The required binding name is `COMMENTS_DB`. Apply `migrations/0001_comments.sql` only after reviewing the target database:

```powershell
npx wrangler d1 migrations apply <YOUR_D1_DATABASE_NAME> --local
npx wrangler d1 migrations apply <YOUR_D1_DATABASE_NAME> --remote
```

The first command is for an explicitly configured local D1 database. The second mutates the production database and must be run only when deployment is approved. Neither command is part of the local implementation step.

## 3. Configure Worker values

Configure these values in the Cloudflare project rather than committing them:

- `GOOGLE_CLIENT_ID`: the Google web client ID. It is sent to the browser by design, but keeping environment-specific configuration outside source avoids accidental mix-ups.
- `ADMIN_GOOGLE_SUB`: the immutable Google `sub` claim for the one designated administrator. Treat it as private configuration.

For local Wrangler testing, put them in an ignored `.dev.vars` file:

```dotenv
GOOGLE_CLIENT_ID=<YOUR_GOOGLE_WEB_CLIENT_ID>
ADMIN_GOOGLE_SUB=<YOUR_GOOGLE_SUB>
```

Never promote the first visitor automatically. To identify the intended administrator safely, sign in once as a normal user after the database is connected, query that known account in D1, and copy its `google_sub` value into `ADMIN_GOOGLE_SUB`:

```sql
SELECT google_sub, display_name FROM comment_users ORDER BY created_at DESC;
```

Confirm the display name belongs to the expected account before setting the value. The public API and comment HTML never expose the `sub` or email address.

## 4. Local and deployment checks

Run the static build and Worker tests:

```powershell
npm run build
npm run test:worker
```

For a full local D1/GIS test, configure a real local D1 binding plus `.dev.vars`, apply the migration locally, and start Wrangler's local server. Google sign-in also requires the matching localhost origin in the Google client configuration.

After deployment, verify:

1. `/api/privacy-region` still returns only `regulated`.
2. `/api/comments/config` reports comments enabled without exposing secrets.
3. A published What I Feel and What I Learn page can list comments.
4. An unpublished or fabricated `section + slug + lang` cannot receive comments.
5. Google sign-in creates an HttpOnly `Secure`, `SameSite=Lax` session cookie.
6. Sign-out clears the session; cross-origin or missing-CSRF writes fail.
7. The configured administrator can open `/admin/comments/`; another Google account receives `403` from admin APIs.
8. Blocking an account immediately prevents new comments even if its old session remains active.

## Security and operating notes

- Sessions last 30 days. Only a SHA-256 hash of the random session token is stored in D1.
- Login uses an Origin check plus a double-submit CSRF token. Authenticated mutations use a session-bound CSRF token.
- Comments are plain text, limited to 2,000 characters, and rendered with `textContent`.
- A user may submit at most 3 comments per minute and 20 per day. Identical comments are rejected for 10 minutes.
- Deleted comments are soft-deleted so moderation history is retained. Decide and document a deletion/retention policy before launch.
- Turnstile is not enabled in this first version. Add it only if observed abuse warrants the extra request and configuration; if added, its token must be verified by the Worker.
- Google Identity Services is downloaded only after a visitor chooses the Google sign-in action. Existing GA consent, Kit, Spotify, and YouTube behavior is independent.

## Privacy Policy update needed before launch

The public policy should be reviewed before comments are enabled. It should accurately disclose:

- Google Identity Services is used only when the visitor chooses to sign in.
- The site receives and stores the Google account's stable `sub` identifier and current display name; email and `sub` are not displayed publicly.
- Public comments show the display name, comment text, and date.
- Cloudflare D1 stores users, sessions, moderation status, and comments.
- The purpose of processing, the owner-selected retention/deletion practice, and how a visitor can request deletion or exercise applicable rights.
- Administrators may remove comments and block/unblock an account from posting.

Do not claim a specific legal basis, retention period, or deletion SLA until the owner has confirmed it for the jurisdictions served.

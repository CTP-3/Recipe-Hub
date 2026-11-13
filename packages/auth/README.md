# @project/auth — Google sign-in and identity

Auth.js handles Google OAuth and database-backed sessions. The server derives
the current user from the session; client-supplied user IDs are not trusted.

## Public API

All exports come from `src/index.ts`:

| Export | What it does |
|---|---|
| `currentUserId()` | Returns the current session's user ID, or `null` when signed out. |
| `handlers` | Auth.js route handlers for OAuth callbacks and session operations. |
| `auth()` | Reads the current Auth.js session on the server. |
| `signIn()` / `signOut()` | Server-side Auth.js sign-in and sign-out actions. |

## Dependencies

- Auth.js and its Prisma adapter
- `@project/db` — persisted user, OAuth-account, and session records

## Consumers

- `apps/web` — via `@project/auth`

## Google OAuth setup

Configure `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_SECRET` in the
environment. Register `http://localhost:3000/api/auth/callback/google` as a
Google OAuth redirect URI for local development. Do not commit credentials.

The web app exposes Auth.js handlers at `/api/auth/*`. Starting sign-in by
opening `/api/auth/signin/google` redirects directly to Google; no custom
login page is required.

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
environment. By default, Auth.js builds the callback URI from the origin used
to open the app, such as `http://localhost:3000/api/auth/callback/google`.
Register that exact URI in Google Cloud Console. If the web app is opened on
another port, register that port's callback URI too, or set
`AUTH_URL=http://localhost:3000` to pin Auth.js to the documented local origin.
Do not commit credentials.

The web app exposes Auth.js handlers at `/api/auth/*`. Starting sign-in by
opening `/api/auth/signin/google` redirects directly to Google; no custom
login page is required.

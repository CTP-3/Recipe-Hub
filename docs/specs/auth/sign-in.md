---
type: feature
---
# Google sign-in

## Why

People need a secure way to sign in to Recipe Hub so the app can associate
their recipes and other private data with the right user.

## Where it lives

- `packages/auth/` — session-derived user identity and authentication setup.
- `apps/web/` — Auth.js routes and protected API routes.
- `packages/db/` — persisted user and authentication-session records.

## Behavior

- In development, a user can test sign-in and sign-out on `/auth-test`, which
  also shows whether required OAuth settings are present without displaying
  their values. The test page is unavailable outside development.
- A user can also start Google sign-in by opening
  `/api/auth/signin/google`.
- Google verifies the visitor and asks for the permissions needed to identify
  them. Recipe Hub does not request access to unrelated Google services.
- On successful sign-in, Recipe Hub creates or finds the corresponding local
  user and starts a database-backed session. The username is optional; the
  sign-in flow does not ask users to choose one.
- The server derives the current user from that session only. A request
  header, URL parameter, or development fallback cannot choose the user.
- A signed-in user can sign out; after sign-out, protected requests no longer
  recognize that session.
- The landing page, `/api/health`, and `/api/auth/*` remain public.
  Protected API routes return 401 when there is no valid session.
- User data is always queried using the session-derived user ID. Unknown and
  other users' resources return 404.

## Examples

| State / input | Behavior |
|---|---|
| Visitor completes Google sign-in for the first time | Recipe Hub creates a local user and starts a session. |
| Returning user completes Google sign-in | Recipe Hub starts a session for the existing local user. |
| Visitor declines or cancels Google sign-in | No authenticated session is created; the visitor remains signed out. |
| Signed-out visitor calls a protected API route | The API returns 401 in the standard error shape. |
| Signed-out visitor checks `/api/health` | The health endpoint remains available without sign-in. |

## Verify

- `pnpm test:integration` covers session-derived identity and signed-out
  access to the media inspection API.
- In development, visit `/auth-test`, confirm the configuration indicators,
  sign in with Google, verify the displayed session, then sign out.
- Confirm `/api/health` still responds while signed out.

## Constraints & decisions

- Google is the only sign-in provider.
- Sessions are stored in the database; the browser receives a session cookie,
  not a user ID it can choose.
- A new account can be created without a username; username setup is deferred
  to a separate feature.
- Only the Google identity information needed to identify the user is
  requested.
- The app uses the existing identity contract in
  [auth.md](../auth.md): the session is the sole source of user identity.

## Out of scope

- Issuing access tokens to third-party business applications; that requires a
  separate authorization-server feature.
- Other sign-in providers, passwords, roles, and administrator access.
- Account deletion, data export, and account linking; these need separate
  behavior specs and privacy decisions.

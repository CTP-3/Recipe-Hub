---
type: infrastructure
---
# Identity — the auth subsystem

Who the current user is, and how every server entry learns it.

## Google sign-in and session-derived identity

- Auth.js v5 + Prisma adapter, database sessions, Google OAuth (one provider).
- Public surface: landing, /api/health, /api/auth/*. Protected API routes
  return 401 for signed-out requests. The sign-in flow is started directly
  through Auth.js routes; the app does not provide a custom login page.
- Identity comes from the session **only**. The client never supplies a user
  id — no header, no param, no dev-only bypass: dev signs in like prod.
- First sign-in creates the user (name/avatar from Google); username remains
  optional until a separate profile setup feature is added.

## Constraints & decisions

- One provider (Google); more is out of scope.
- Roles/admin, account deletion + export: future work with a privacy doc.
- Issuing access tokens to third-party business applications is a separate
  authorization-server feature, not part of user sign-in.

## Key decisions

- [ADR-0003](../adr/0003-dev-identity-stub.md) — history and rationale for the original development stub.

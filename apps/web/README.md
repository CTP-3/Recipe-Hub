# @project/web — the Next.js app

The user-facing web application. A Next.js server-rendered React app.

The app includes recipe discovery, collection, and video-based creation pages,
alongside its API routes and Client Components.

## Public surface

All public routes are defined under `app/api/`:

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | Redirects to the recipe creation flow |
| `/home` | GET | Recipe discovery and home page |
| `/my-recipes` | GET | Saved, created, and recipe creation tabs |
| `/upload` | GET | Redirects to the Create tab on My Recipes |
| `/api/health` | GET | Health check — is the process alive? Can it reach the DB? |
| `/api/auth/*` | GET/POST | Auth.js Google sign-in, callback, session, and sign-out handlers |
| `/auth-test` | GET | Development-only Google sign-in test page |

The sign-in flow can be started from the shared navigation or by opening
`/api/auth/signin/google`. Recipe-processing API routes require a valid
session. The development-only `/auth-test` page is available by direct URL but
is not linked from navigation.

## Dependencies

- `@project/db` — the Prisma client and generated types
- `@project/services` — queue, storage, and notify adapters
- `@project/domain` — Zod schemas and database queries (empty on main, populated on example branches)
- `@project/auth` — Google OAuth handlers and session-derived `currentUserId()`
- `@project/log` — pino logger

## Consumers

Users with a browser. No other app or package imports from `@project/web`.

## Local dev

```bash
pnpm dev:web     # starts the Next.js dev server
```

The dev server expects a Postgres server and Azurite running alongside it.
Start everything together with `pnpm dev` from the repo root. The dev server
uses Turbopack (`--turbopack`).

## When it changes

- A new route goes in `app/api/`.
- A new Client Component goes in `components/`.
- Routes are Server Components. Forms and interactivity are Client Components.
  The split is Week 5's topic.
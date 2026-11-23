---
type: feature
---
# Video recipes are cached, bookmarkable, and selectively published

## Why
People should be able to turn a supported cooking video into a persistent
recipe once, return to that result without repeating extraction, keep it in
their account, and optionally share it with Explore.

## Where it lives
- `apps/web/app/api/recipes/` — source normalization, job submission/status,
  owner-only regeneration, created-recipe listing, bookmarks, publication,
  and public recipe reads.
- `apps/web/components/RecipeCreator.tsx` — link-first submission, status
  polling, cover preview, and save/publish actions.
- `apps/web/app/home/page.tsx`, `apps/web/app/my-recipes/page.tsx`, and
  `apps/web/app/recipes/[id]/page.tsx` — published Explore cards, the
  account's created-recipe list, publication controls, and recipe details.
- `apps/worker/src/index.ts` — idempotent extraction and cover storage jobs.
- `packages/domain/src/` — URL/source validation, cache, ownership, bookmark,
  and publication queries.
- `packages/services/src/` — extraction-service and blob-storage adapters.
- `packages/db/prisma/schema.prisma` and append-only SQL migrations — source,
  generated recipe, and bookmark relationships.
- `services/recipe-extraction/` — bounded video-frame extraction.

## Behavior
- One shared URL parser validates the browser submission, source
  normalization, and provider dispatch. YouTube watch, Shorts, and `youtu.be`
  links; TikTok video and short/share links; and Instagram Reel links are
  normalized to platform-specific stable video identifiers before hashing.
  TikTok short redirects are manually followed for at most five hops and only
  over HTTPS to allowlisted TikTok hosts. Irrelevant tracking parameters do
  not affect identity. Uploaded files use a separate SHA-256 over their bytes
  and cannot collide with link identities.
- A canonical source hash identifies each normalized link or upload. A public
  completed recipe or a source already readable by the current owner is reused.
  If the canonical source is private to another account, the submitting
  authenticated user receives a separate source keyed by that user and the
  canonical hash; private recipe data and job state are never shared across
  owners. Each source tracks queued, processing, ready, or failed extraction
  state, and a successful source points to one generated recipe. Unique
  database constraints make concurrent submissions converge on one source
  for the same owner and identity.
- Link extraction is submitted as a queue job. The web app returns a job ID
  and polls its status; the Vercel request does not remain open during
  Panoscribe or Classroom AI work. Duplicate submissions reuse the ready
  recipe or existing in-progress job. Failed and incomplete jobs are not cache
  hits and can be retried explicitly.
- The video-inspection adapter dispatches YouTube, TikTok, and Instagram
  links to their respective Social Media Video Downloader API endpoints; it
  never sends other platforms to the TikTok endpoint. The extraction service
  accepts only the provider's fixed HTTPS proxy host and `/rproxy/` path, then
  sends the downloaded video through the same Panoscribe and Classroom AI
  pipeline.
- Link sources retain the canonical platform, video URL, video ID, and
  available creator username, display name, and profile URL. TikTok and
  YouTube public oEmbed endpoints provide metadata where available; Instagram
  reuses metadata from the existing inspection provider. Provider profile URLs
  are validated against the platform's HTTPS host and profile path. Metadata
  failures do not block recipe generation, and unknown creator details are
  never inferred from the Recipe Hub account or recipe text.
- Explore cards and generated/saved recipe details identify the original
  video creator separately from the Recipe Hub contributor and link to the
  canonical original video. They show “Original creator unavailable” when
  profile metadata is absent and include a copyright attribution disclaimer.
  Saving, publishing, deduplication, and regeneration do not overwrite source
  attribution. Existing TikTok source records can be enriched with
  `pnpm exec tsx scripts/backfill-tiktok-attribution.ts`; this only requests
  public metadata and updates missing source fields, without re-extracting
  recipes.
- Recipe JSON preserves servings, times, ingredient quantities and estimates,
  spoken wording, notes, instructions, tips, transcript, OCR, and source
  metadata. Existing extraction validation and `summarize`-then-`generate`
  fallback remain in force.
- A representative frame is extracted from the processed video using the
  installed FFmpeg runtime. It is stored as a blob in the existing Azure Blob
  Storage/Azurite seam; PostgreSQL stores the blob key, never image bytes.
  Classroom AI is not treated as an image generator. If frame extraction or
  blob upload fails, or a stored image later becomes unavailable, recipe
  details show a compact “Cover image unavailable” fallback without a broken
  image icon or an unrelated recipe image. Regeneration retains the existing
  cover reference if no replacement frame can be stored.
- A private guest-generated cover may be read with the same validated,
  source-scoped access token used to poll its extraction job. Authenticated
  owners, saved users, and public readers continue to use their existing
  authorization paths.
- Generated recipes are private by default. Local-file uploads are never
  publishable. The authenticated creator may explicitly publish an eligible
  link-based recipe; public Explore reads include only published recipes.
- A generated recipe is stored once and can be bookmarked by multiple users.
  Bookmark writes are authenticated, owner-scoped, and idempotent. Removing a
  bookmark does not delete the generated recipe. Existing demo recipes can
  still be bookmarked through the same authenticated persistence API.
- My Recipes Saved lists account bookmarks across demo and generated recipes.
  Its Created list separately shows generated recipes owned by the account,
  with owner-only publication and link-regeneration controls. Generated recipe
  details preserve their complete extraction payload. Foreign and unknown
  private recipes return 404.
- Explore merges published database recipes with a visibly separate demo
  section, provides search/category filtering, and paginates database results.
  Cards use the stored cover image or the compact cover-unavailable state.
- Every queue handler is idempotent. A transient failure leaves the source
  retryable; a completed job is acknowledged only after its database update
  succeeds. Regeneration is an authenticated owner action and does not create a
  duplicate source or published recipe.

## Examples

| State / input | Behavior |
|---|---|
| Submit a normalized link already marked ready | Return the existing recipe without calling extraction again. |
| Submit an equivalent URL while its job is active | Return the existing job rather than enqueue another extraction. |
| Submit a link whose private source belongs to another account | Create or reuse a source for the current account; do not reveal the other account's job or recipe. |
| Submit a link with an existing public recipe | Return the public recipe without starting extraction. |
| Two requests race for a new source | The unique source identity admits one job; both requests observe that job. |
| Extraction fails or returns invalid recipe data | Mark the job failed; do not make a cache hit or publish it. |
| Upload a local video | Hash its bytes independently; the resulting recipe is private and cannot be published. |
| Bookmark a generated recipe twice | Keep one bookmark for the current user. |
| An unauthenticated user bookmarks or publishes | Return 401 and make no ownership change. |
| A user requests another user's private recipe | Return 404. |
| A recipe owner publishes a link-based recipe | It becomes eligible for Explore; unpublishing removes it from public results. |
| Cover extraction or blob storage is unavailable | Keep the recipe and display a compact cover-unavailable message; keep an existing cover on regeneration. |

## Verify
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and the recipe extraction
  Python tests.
- Test URL normalization for supported long and short links, irrelevant query
  parameters, unsupported hosts, unsafe redirects, and malformed IDs; verify
  the SHA-256 values are deterministic.
- Verify watch, Shorts, and youtu.be links use the YouTube provider route,
  TikTok video/share links use the TikTok route, and Instagram Reels use the
  Instagram route.
- Verify upload hashes vary with file bytes and use a separate identity
  namespace from URL hashes.
- Test cache hits, misses, concurrent submissions, failed-job retries, and
  worker redelivery against PGlite or the local PostgreSQL integration setup.
- Verify a successful extraction creates one source and one recipe, stores a
  cover blob when storage is available, preserves the structured payload, and
  serves the blob to the owner, bookmarker, or public reader. Verify a private
  guest can only load the cover with the source access token.
- Verify TikTok short-link redirects remain restricted to HTTPS TikTok hosts,
  TikTok and YouTube oEmbed metadata is optional, Instagram metadata comes
  from the existing inspection provider, unsafe profile/video URLs are not
  rendered, and missing metadata leaves the canonical source link available.
- Run the TikTok attribution backfill against a local database with existing
  TikTok source rows; verify it fills missing metadata without changing recipe
  records or existing creator values.
- Bookmark while authenticated, refresh and re-login, unbookmark, repeat, and
  verify the recipe is neither duplicated nor deleted.
- Publish and unpublish a link-based recipe; verify Explore pagination and
  that private recipes and uploads never appear publicly.
- Verify anonymous and cross-user bookmark, detail, delete, publish, and
  regenerate requests are rejected with the established API error shape.
- Verify an owner can queue one regeneration at a time, the worker refreshes
  the existing recipe record, and the detail page reflects the completed
  result without creating a duplicate source or recipe; if no replacement
  cover is available, preserve the existing cover reference.
- Manually submit a public supported video link, observe queued progress,
  verify the generated recipe and cover, bookmark it, refresh My Recipes, and
  publish it to Explore. Confirm no secrets are present in client responses.

## Constraints & decisions
- Azure Blob Storage/Azurite is the only persistent cover-image storage;
  production requires `AZURE_STORAGE_CONNECTION_STRING` to point to a
  persistent Azure Storage account.
- Cover images are selected from a bounded FFmpeg frame sample. No new paid
  image-generation service or unsupported Classroom AI endpoint is used.
- The existing Auth.js session is the only source of account identity.
- Published recipes are a deliberate opt-in; generated recipes and uploads
  remain private unless an eligible owner publishes a link-based recipe.
- Demo catalog entries remain available until database-backed Explore is
  verified; they are labeled separately from published recipes.
- Video extraction remains in the existing FastAPI/Panoscribe/Classroom AI
  service. The queue worker coordinates it so the web request is not held
  open for the extraction duration.

## Out of scope
- AI-generated images, editing recipe content, social comments, and
  collaborative cookbooks are not part of this behavior.
- Authentication changes are covered by [auth.md](../auth.md); storage
  contracts are covered by [storage.md](../storage.md).

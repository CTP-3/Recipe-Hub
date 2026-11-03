---
type: feature
---
# Video links return provider metadata and media details

## Why
Users can submit a public video link and retrieve the details and media options
provided by the configured video service.

## Where it lives
- `apps/web/app/api/media/inspect/route.ts`
- `apps/web/app/api/recipes/extract-link/route.ts`
- `apps/web/app/upload/page.tsx`
- `services/recipe-extraction/main.py`

## Behavior
- `POST /api/media/inspect` accepts a JSON body containing a `url`.
- The route derives the current user before processing the request.
- Only HTTPS links on supported YouTube, TikTok, and Instagram hostnames are
  accepted. Unknown hosts, credentials in the URL, malformed links, and
  unrecognized video URL formats receive a 400 error.
- The route calls the matching SMVD details endpoint from the server, using
  `SMVD_RAPIDAPI_KEY`; the key is never returned to the client.
- A successful response has the shape `{ platform, result }`, where `result`
  is the SMVD JSON response, including any description and media links the
  provider returns.
- Invalid JSON, missing configuration, unavailable videos, provider errors,
  and rate limits return the standard `{ error: { code, message } }` shape.
- The upload page accepts a video link and sends it to the inspection route.
  It displays the first downloadable video option and the description in its
  `dl` query parameter.
- The upload page can send that option and description to
  `POST /api/recipes/extract-link`. The route accepts only HTTPS download URLs
  from the provider's media host and forwards them to the recipe extraction
  service.
- The extraction service downloads videos up to 25 MB without following
  redirects, transcribes them, and supplies the description as additional
  context for recipe generation.

## Examples

| State / input | Behavior |
|---|---|
| Valid public TikTok video URL | Calls the TikTok details endpoint and returns `{ platform: "tiktok", result }`. |
| Valid YouTube video URL | Calls the YouTube video details endpoint using its video ID. |
| Valid Instagram post or reel URL | Calls the Instagram media details endpoint using its shortcode. |
| Inspected response includes a downloadable video | Displays its description and sends its URL and description to recipe extraction when requested. |
| Inspected response has no supported downloadable video | Displays the provider response but does not offer link-based recipe extraction. |
| URL on an unsupported host | Returns 400 without making an upstream request. |
| Missing RapidAPI key | Returns a configuration error without making an upstream request. |

## Verify
- Run `pnpm test && pnpm typecheck && pnpm build`.
- With `SMVD_RAPIDAPI_KEY` configured in `apps/web/.env.local`, submit one
  supported URL to `/api/media/inspect` and confirm the result includes the
  provider's description and media information. Generate a recipe and confirm
  the video is downloaded, transcribed, and the description is included as
  extra context.
- Submit a URL from an unsupported host and confirm the route returns 400.

## Constraints & decisions
- The route returns the provider's JSON result rather than assuming a response
  schema that may change between platforms.
- Link-based extraction accepts only the provider's downloadable media host
  and does not follow redirects, limiting server-side downloads to provider
  media URLs.
- Only the provider's details endpoints are used. Availability of a direct
  media link depends on the provider response and its access rules.

## Out of scope
- Persistent storage of downloaded video media is not part of this behavior.

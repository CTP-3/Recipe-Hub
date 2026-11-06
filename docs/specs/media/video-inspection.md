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
  `SMVD_RAPIDAPI_KEY` configured in `apps/web/.env.local`; the key is never
  returned to the client. Local development requires restarting the web app
  after setting the key.
- A successful response has the shape `{ platform, result }`, where `result`
  is the SMVD JSON response, including any description and media links the
  provider returns.
- Invalid JSON, missing configuration, unavailable videos, provider errors,
  and rate limits return the standard `{ error: { code, message } }` shape.
- The upload page accepts a video link and sends it to the inspection route.
  When the provider returns a downloadable video, the page automatically sends
  the first option and its description to `POST /api/recipes/extract-link`.
  The provider's raw JSON and video details are not displayed; the page shows
  the extraction status and resulting recipe.
- If automatic extraction fails after inspection, the page offers a retry
  action without requiring the user to inspect the link again.
- `RECIPE_SERVICE_URL` may identify the service base URL or either extraction
  endpoint; the upload and link routes resolve their respective endpoint paths
  consistently.
- `pnpm dev` starts the Python extraction API on `127.0.0.1:8000`. Local video
  processing requires the extraction service's Python dependencies, FFmpeg,
  and a running Ollama service with the configured model available.
- The extraction service downloads videos up to 25 MB without following
  redirects, transcribes them, and supplies the description as additional
  context for recipe generation.

## Examples

| State / input | Behavior |
|---|---|
| Valid public TikTok video URL | Calls the TikTok details endpoint and returns `{ platform: "tiktok", result }`. |
| Valid YouTube video URL | Calls the YouTube video details endpoint using its video ID. |
| Valid Instagram post or reel URL | Calls the Instagram media details endpoint using its shortcode. |
| Inspected response includes a downloadable video | Automatically downloads, transcribes, and generates a recipe from the first option, using its description as context, without displaying raw provider data. |
| Inspected response has no supported downloadable video | Displays an error without displaying raw provider data. |
| Automatic link extraction fails after inspection | Displays the error and offers recipe-generation retry. |
| Local development starts with `pnpm dev` | Starts the web app, worker, storage/database services, and the recipe extraction API. |
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
- Transcription uses the extraction service's configured local Whisper model;
  no external transcription API is configured by this behavior.
- Only the provider's details endpoints are used. Availability of a direct
  media link depends on the provider response and its access rules.

## Out of scope
- Persistent storage of downloaded video media is not part of this behavior.

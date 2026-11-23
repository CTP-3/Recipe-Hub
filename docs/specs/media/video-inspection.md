---
type: feature
---
# Video links return provider metadata and media details

## Why
Users can submit a public video link and retrieve the details and media options
provided by the configured video service.

## Where it lives
- `apps/web/app/api/media/inspect/route.ts`
- `apps/web/app/api/recipes/extract/route.ts`
- `apps/web/app/api/recipes/extract-link/route.ts`
- `apps/web/components/RecipeCreator.tsx`
- `apps/web/app/my-recipes/page.tsx`
- `docker-compose.yml`
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
- The My Recipes page's Create tab accepts a video link and sends it to the
  inspection route. `/upload` redirects to that tab.
  When the provider returns a downloadable video, the page automatically sends
  the first option and its description to `POST /api/recipes/extract-link`.
  The provider's raw JSON and video details are not displayed; the page shows
  the extraction status and resulting recipe.
- If automatic extraction fails after inspection, the page offers a retry
  action without requiring the user to inspect the link again.
- `RECIPE_SERVICE_URL` may identify the service base URL or either extraction
  endpoint; the upload and link routes resolve their respective endpoint paths
  consistently.
- The upload route forwards MP4, MOV, WebM, or M4V files up to 25 MB to the
  extraction service. The service writes each video to the shared directory
  with a random filename and removes it after processing.
- The extraction service submits the shared file to Panoscribe with OCR
  enabled, polls the returned job for up to 10 minutes, and separates the
  completed job's `SPEECH` and `ON-SCREEN` segments. Both the transcript and
  up to 40 timestamped OCR candidates are supplied as untrusted recipe evidence and
  returned to the page for review. Repeated OCR strings are deduplicated after
  case and whitespace normalization, retaining the first timestamp. The
  documented Panoscribe job request exposes an OCR toggle, not a sampling
  interval; the integration does not request individual frame sampling.
- In Compose, `recipe-api` reaches Panoscribe at
  `http://panoscribe-api:9000`; both containers mount
  `services/recipe-extraction/shared-videos` at `/shared`. When FastAPI runs
  locally through `pnpm dev`, it defaults to
  `http://127.0.0.1:9000` and writes video files under
  `services/recipe-extraction/shared-videos`. Compose explicitly overrides
  these defaults with its container hostname and `/shared` mount. Both
  settings can be overridden with `PANOSCRIBE_URL` and `SHARED_DIR`. For both
  local and Compose runs, Panoscribe reads the shared file through its
  container path under `/shared`; `PANOSCRIBE_SHARED_DIR` overrides that path.
- Local `pnpm dev` binds the recipe extraction API to port 8001. Docker Compose
  retains port 8000, so both APIs can run on the same host without competing
  for a port. The web app and worker use the local port 8001 by default;
  `RECIPE_SERVICE_URL` can override it.
- Recipe generation uses the server-only `CLASSROOM_AI_URL` and
  `CLASSROOM_AI_KEY` settings. It requests a strict JSON schema from the
  `summarize` model first, then tries `generate` once if the response is
  truncated, invalid JSON, or does not validate. SDK retries are disabled,
  rate-limit responses stop the fallback, and each attempt logs its model,
  finish reason, and validation outcome without logging prompt or credential
  contents. The returned recipe preserves ingredient quantity estimates and
  spoken wording while mapping steps and times to the existing page response.
  The web extraction routes allow 15 minutes for transcription and generation.
- Link extraction streams media up to 250 MB from the approved provider host
  into the shared directory without following redirects and supplies the
  provider description as additional recipe evidence. It rejects a larger
  declared `Content-Length` before downloading and enforces the same limit
  while streaming when the size is unknown or inaccurate. Direct uploads
  remain limited to 25 MB.

## Examples

| State / input | Behavior |
|---|---|
| Valid public TikTok video URL | Calls the TikTok details endpoint and returns `{ platform: "tiktok", result }`. |
| Valid YouTube video URL | Calls the YouTube video details endpoint using its video ID. |
| Valid Instagram post or reel URL | Calls the Instagram media details endpoint using its shortcode. |
| Inspected response includes a downloadable video | Automatically downloads, transcribes, and generates a recipe from the first option, using its description as context, without displaying raw provider data. |
| Completed Panoscribe job has speech and on-screen segments | Speech and OCR are both supplied to recipe generation; the page exposes the transcript and OCR candidates. |
| Inspected response has no supported downloadable video | Displays an error without displaying raw provider data. |
| Automatic link extraction fails after inspection | Displays the error and offers recipe-generation retry. |
| Local development starts with `pnpm dev` and Panoscribe on port 9000 | The Python extraction API uses Panoscribe through its host URL. |
| URL on an unsupported host | Returns 400 without making an upstream request. |
| Missing RapidAPI key | Returns a configuration error without making an upstream request. |

## Verify
- Run `pnpm test && pnpm typecheck && pnpm build`.
- Run `.venv/bin/python -m unittest discover -s services/recipe-extraction -p 'test_*.py'`.
- With `SMVD_RAPIDAPI_KEY` configured in `apps/web/.env.local`, submit one
  supported URL to `/api/media/inspect` and confirm the result includes the
  provider's description and media information. Generate a recipe and confirm
  the video is downloaded, transcribed, and the description and OCR are used
  as recipe evidence.
- Upload a video under 25 MB and confirm the API stores it in the shared
  directory, waits for Panoscribe, then returns a recipe with transcript and
  OCR candidates. Verify the page displays the transcript and OCR details.
- Submit a linked video below 250 MB and confirm it is streamed to the shared
  directory and processed. For a linked video over 250 MB, confirm the job
  fails with a message naming the 250 MB limit; direct uploads over 25 MB
  remain rejected.
- Submit a URL from an unsupported host and confirm the route returns 400.

## Constraints & decisions
- The route returns the provider's JSON result rather than assuming a response
  schema that may change between platforms.
- Link-based extraction accepts only the provider's downloadable media host
  and does not follow redirects, limiting server-side downloads to provider
  media URLs. It writes media to disk in bounded chunks and enforces a 250 MB
  maximum; direct uploads retain their separate 25 MB limit.
- Panoscribe is an HTTP job service; the extraction API does not import a local
  transcription package or start a transcription subprocess.
- Classroom AI is called through its OpenAI-compatible API; model selection
  and structured output validation remain server-side.
- Only the provider's details endpoints are used. Availability of a direct
  media link depends on the provider response and its access rules.

## Out of scope
- Persistent storage of downloaded video media is not part of this behavior.

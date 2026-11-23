# Recipe Hub

Recipe Hub helps people turn cooking videos into structured recipes they can
save privately or choose to share on Explore. For a video link, the web app
checks the source, puts an extraction job on a local queue, and a background
worker sends the video through Panoscribe for speech and on-screen text. A
recipe service then uses the configured Classroom AI endpoint to turn that
evidence into a recipe.

**Production hosting:** Not available yet. Azure backend and Vercel frontend
deployment are planned.

## What you need

Install these before you begin:

- **Node.js 24** — the version used by continuous integration:
  [nodejs.org](https://nodejs.org/)
- **pnpm 11.17.0** — the exact version pinned by this repository. With Node
  installed, enable Corepack; it selects the pinned pnpm version:
  [pnpm installation guide](https://pnpm.io/installation)
- **Python 3.11** — runs the local video extraction API:
  [python.org/downloads](https://www.python.org/downloads/)
- **Docker Desktop** — runs Panoscribe, the video transcription service:
  [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
- **FFmpeg** — used to capture a recipe cover frame:
  [ffmpeg.org/download](https://ffmpeg.org/download.html)

The local app starts its own PostgreSQL database and Azurite storage emulator;
you do not need to install PostgreSQL or Azure Storage. Docker is needed for
Panoscribe. You will also need access to the team's Panoscribe Docker image
and service credentials listed below; they are not included in this repository.

## First-time setup

The commands below are for macOS/Linux terminals. On Windows, use WSL2 and
follow the same commands inside its Linux terminal.

### 1. Clone and install

```sh
git clone https://github.com/olivia-jervise/Recipe-Hub.git
cd Recipe-Hub
corepack enable
pnpm --version
pnpm install --frozen-lockfile
pnpm prisma:generate
```

`pnpm --version` should report `11.17.0`. If Corepack is unavailable, install
pnpm 11.17.0 using the [pnpm installation guide](https://pnpm.io/installation).

### 2. Install the local video service dependencies

Make sure Python 3.11 and FFmpeg are installed and available in your terminal,
then run:

```sh
python3.11 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r services/recipe-extraction/requirements.txt
```

### 3. Configure local environment files

Create the ignored local environment files:

```sh
cp .env.example .env
cp .env.example apps/web/.env.local
```

Ask the team for:

- **SMVD RapidAPI key** — needed to inspect supported video links.
- **Classroom AI endpoint and API key** — needed to generate recipes from
  video evidence.
- **Google OAuth client ID and secret** — needed to sign in, save recipes, or
  publish them. Without these, the app can still open, but signed-in features
  are unavailable.
- **Panoscribe image/access instructions** — the `panoscribe-api:latest`
  Docker image is referenced by Compose but is not built from this repository.

Edit `.env` in the repository root and fill in `CLASSROOM_AI_URL` and
`CLASSROOM_AI_KEY`. For sign-in, also fill in `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, and `AUTH_SECRET` there. Set `AUTH_URL` to
`http://localhost:3000` and register this exact Google redirect URI with the
OAuth client:

```text
http://localhost:3000/api/auth/callback/google
```

In `apps/web/.env.local`, set `SMVD_RAPIDAPI_KEY`. You may also set the same
Google OAuth values there if you prefer to keep web settings together.
`AUTH_SECRET` should be a long, random value; never share it or commit either
environment file. The app uses local database and storage defaults, so you
normally do not need to set `DATABASE_URL` or
`AZURE_STORAGE_CONNECTION_STRING`. The local extraction API defaults to
Panoscribe at `127.0.0.1:9000` and uses the same shared-video folder as Docker;
no extra settings are needed for the normal local setup.

### 4. Start Panoscribe

Start Docker Desktop, make sure the team-provided image is available locally,
then run:

```sh
docker compose up -d panoscribe-api
docker compose ps
```

Wait until `panoscribe-api` is healthy. If Docker says it cannot find or pull
`panoscribe-api:latest`, ask the team for the image registry or setup
instructions; this repository does not include that image.

### 5. Start the app

From the repository root, load the root environment file into the terminal and
start all local app processes:

```sh
set -a
. ./.env
set +a
pnpm dev
```

Keep this terminal open while you use the app. `pnpm dev` starts the web app,
background worker, local PostgreSQL database, Azurite, and local Python
extraction API. Docker runs Panoscribe separately. Open
[http://localhost:3000](http://localhost:3000).

On first start, the database server creates its local data folder and applies
the repository's migrations automatically. Your local database is kept in
`.pgdata/`; Azurite data is kept in `.azurite/`. Neither folder should be
deleted to fix an ordinary startup problem.

## Try the video recipe flow

1. Sign in with the team's Google OAuth setup using **Sign in**.
2. Open **My Recipes**, choose **Create**, and paste a supported public
   TikTok, YouTube, or Instagram video link.
3. Choose **Find or Generate Recipe** and wait for the background job.
4. Review the generated recipe. Choose **Save Recipe** to keep it in **My
   Recipes → Saved**.
5. To share an eligible video recipe, use its explicit **Publish** action.
   Publishing is not automatic. Published recipes appear on **Explore**.

The first live extraction also depends on the video being available to the
configured link-inspection provider and on Panoscribe and Classroom AI being
reachable. Those external services may have their own access limits.

## Stop and restart

- To stop local app services, press **Ctrl+C** in the terminal running
  `pnpm dev`. This stops the web app, worker, local database process, Azurite,
  and local extraction API. Your database and Azurite data remain on disk.
- To stop Panoscribe without deleting data, run:

  ```sh
  docker compose stop panoscribe-api
  ```

- To restart, start Docker Desktop, run `docker compose up -d panoscribe-api`,
  then run the `set -a` / source `.env` / `pnpm dev` commands above in a
  terminal at the repository root.

Do not run a second `pnpm dev` in another terminal. It starts services on the
same ports. Local extraction uses port **8001**; Docker Compose's separate
`recipe-api` service uses port **8000** and is not part of this startup
workflow.

## Common problems

| Problem | What to check |
|---|---|
| Port 3000 is already in use | Stop your other local web server first. On macOS/Linux, `lsof -nP -iTCP:3000 -sTCP:LISTEN` shows the process. Stop it from its own terminal; do not kill a process you do not recognize. |
| Database connection error | Confirm `pnpm dev` is running and the database server started. The local database listens on port 5433. Check that another PostgreSQL service is not already using that port. |
| Missing API key or recipe-generation settings | Check that `SMVD_RAPIDAPI_KEY` is in `apps/web/.env.local`, and `CLASSROOM_AI_URL` and `CLASSROOM_AI_KEY` are set in root `.env`. Restart `pnpm dev` after changing values, and source `.env` as shown above. |
| Docker is unavailable | Open Docker Desktop and wait for it to finish starting before running `docker compose`. |
| Google sign-in fails | Check the OAuth client ID/secret and `AUTH_SECRET`. The redirect URI in Google settings must exactly match `http://localhost:3000/api/auth/callback/google`. If the app is on another port, update `AUTH_URL` and the registered redirect URI to match. |
| Worker or Azurite connection error | Keep the single `pnpm dev` process running; it starts both the worker and Azurite. Check its terminal for startup errors and make sure ports 10000–10002 are available. |
| Video job stays queued or extraction fails | Confirm `docker compose ps` reports Panoscribe healthy, the worker is running, and the team credentials are configured. Link inspection also requires the RapidAPI key. |
| Docker cannot find `panoscribe-api:latest` | The image is not in this repository. Request the team's current image or registry instructions. |
| Video reports a size limit | Linked videos are limited to 250 MB; direct uploads have a separate 25 MB limit. Use a smaller supported video. |

## Current project status

### Implemented and covered by automated tests

- Video URL validation and normalization, job queuing, status polling, and
  duplicate-source handling.
- Recipe saving, explicit publishing, and public Explore reads.
- Original-video attribution and links when metadata is available.
- Stored cover images with a compact fallback when a cover cannot be shown.
- Bounded linked-video downloads and user-facing errors for oversized videos.

Automated tests, typechecks, and a production build have passed during
development. This does **not** mean every external service or every full
browser workflow has been verified with production credentials.

### Requires team setup or more end-to-end verification

- A real TikTok-to-Explore run depends on the team's RapidAPI key, Panoscribe
  image, Classroom AI endpoint/key, and Google OAuth credentials.
- Provider metadata and thumbnails are not guaranteed: platforms may block,
  omit, or change public metadata. The recipe keeps a source link and shows a
  fallback when creator or cover information is unavailable.
- The complete sign-in → generate → save → publish flow has not been
  independently verified against the shared external services as part of this
  README update.

### Known project limitations

- There is no production deployment yet. Azure backend and Vercel frontend
  hosting are planned, not complete.
- The recipe-generation and video-inspection integrations require team-managed
  external services and credentials; a fresh clone alone cannot perform live
  extraction.

## Tests and checks

Run these from the repository root:

```sh
pnpm test
pnpm test:integration
pnpm typecheck
pnpm build
```

The automated tests use local/in-memory test data and do not require the live
video services. Python extraction-service tests can be run with:

```sh
./.venv/bin/python -m unittest discover -s services/recipe-extraction -p 'test_*.py'
```

## Future deployment

The current plan is to host backend services and data on Azure and the web
frontend on Vercel. Production infrastructure, secrets, and deployment
configuration are not finished; local setup is the supported way to run the
project today.

## More information

- [Project specifications](docs/specs/)
- [Development and contribution workflow](CONTRIBUTING.md)
- [Agent conventions](AGENTS.md)

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

| Install | Version | macOS (Homebrew) | Windows |
|---|---|---|---|
| [Git](https://git-scm.com/downloads) | any | `brew install git` | Use WSL2 (below) |
| [Node.js](https://nodejs.org/) | 24 | `brew install node@24` | Inside WSL2 |
| [pnpm](https://pnpm.io/installation) | 11.17.0 | `npm install -g pnpm@11.17.0` | Inside WSL2 |
| [Python](https://www.python.org/downloads/) | 3.9 or newer | `brew install python@3.12` | `sudo apt install python3 python3-venv` |
| [FFmpeg](https://ffmpeg.org/download.html) | any | `brew install ffmpeg` | `sudo apt install ffmpeg` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | current | `brew install --cask docker` | Install on Windows; enable WSL integration |

Keep about 40 GB of disk space free: the Panoscribe image alone is about 10 GB.
You do not need to install PostgreSQL or Azure Storage; the app runs its own.

On Windows, install [WSL2](https://learn.microsoft.com/windows/wsl/install)
and run every command in its Ubuntu terminal. The setup has only been run on
an Apple Silicon Mac so far.

Ask the team privately for these values. Never commit or post them:
`SMVD_RAPIDAPI_KEY`, `CLASSROOM_AI_URL`, `CLASSROOM_AI_KEY`, `AUTH_GOOGLE_ID`,
and `AUTH_GOOGLE_SECRET`.

## First-time setup

### 1. Get the code and install

```sh
git clone https://github.com/olivia-jervise/Recipe-Hub.git
cd Recipe-Hub
git switch feature/recipe-pipeline-stabilization
pnpm install --frozen-lockfile
pnpm prisma:generate
python3 -m venv .venv
./.venv/bin/python -m pip install -r services/recipe-extraction/requirements.txt
```

### 2. Add your settings

```sh
cp apps/web/.env.example apps/web/.env.local
cp services/recipe-extraction/.env.example services/recipe-extraction/.env
openssl rand -base64 32
```

Put the generated value in `AUTH_SECRET` in `apps/web/.env.local`, then fill in
the team values in both files. Both are ignored by Git. The Google OAuth client
must list this redirect URI, and your Google account must be one of its test
users if the client is still in testing:

```text
http://localhost:3000/api/auth/callback/google
```

### 3. Build Panoscribe (once)

Panoscribe is a separate public project. Open Docker Desktop, wait until it is
running, then build the image Recipe Hub expects. This downloads several
gigabytes and can take a long time.

```sh
cd ..
git clone https://github.com/dagonet/panoscribe.git
cd panoscribe
git checkout a6b6364
sed -i.bak '/uv sync/s/--extra photo/--extra photo --extra api/' Dockerfile
docker build -t panoscribe-api:latest .
cd ../Recipe-Hub
```

The `sed` line adds Panoscribe's HTTP API, which its Dockerfile leaves out.

## Run it every day

Open Docker Desktop, wait until it is running, then from `Recipe-Hub`:

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `pnpm dev` checks ports and
settings, starts Panoscribe, then runs the web app, worker, database, storage
emulator, and extraction API. The first start creates the database and applies
migrations. Keep the terminal open, and do not run a second `pnpm dev`.

After pulling new code, run
`pnpm install --frozen-lockfile && pnpm prisma:generate` first.

## Try the video recipe flow

1. Sign in with the team's Google OAuth setup using **Sign in**.
2. Open **My Recipes**, choose **Create**, and paste a supported public
   TikTok video link.
3. Choose **Find or Generate Recipe** and wait for the background job.
4. Review the generated recipe. Choose **Save Recipe** to keep it in **My
   Recipes → Saved**.
5. To share an eligible video recipe, use its explicit **Publish** action.
   Publishing is not automatic. Published recipes appear on **Explore**.

The first live extraction also depends on the video being available to the
configured link-inspection provider and on Panoscribe and Classroom AI being
reachable. Those external services may have their own access limits.

## Stop and restart

- Press **Ctrl+C** in the `pnpm dev` terminal. Your recipes stay on disk.
- To also stop Panoscribe: `docker compose stop panoscribe-api`
- To restart, open Docker Desktop and run `pnpm dev`.

A video that was processing when you stopped resumes after a restart. Do not
delete `.pgdata/` or `.azurite/`, and do not run `pnpm db:reset`: they hold your
recipes.

## Common problems

| Problem | What to do |
|---|---|
| "These ports are already in use" | Recipe Hub is already running, or another program has the port. Press Ctrl+C in the other terminal. `lsof -nP -iTCP:3000 -sTCP:LISTEN` shows what uses a port. |
| "Cannot connect to the Docker daemon" | Open Docker Desktop, wait until it is running, and rerun `pnpm dev`. |
| Docker cannot find or pull `panoscribe-api:latest` | Build it with step 3 of the setup. |
| `No module named uvicorn` | Rerun the two Python commands in step 1. |
| "Classroom AI credentials are not configured." | Fill in `services/recipe-extraction/.env`, then restart. |
| "The video service is not configured." | Set `SMVD_RAPIDAPI_KEY` in `apps/web/.env.local`, then restart. |
| Google sign-in fails | Check the three Google and auth settings, the redirect URI, and the OAuth client's test users. |
| "Recipe extraction was interrupted." | The worker stopped mid-job. Submit the link again. |
| "Panoscribe API request failed." | Run `docker compose ps`; if Panoscribe is not healthy, run `docker compose up -d panoscribe-api`. |
| A video is too large | Links are limited to 250 MB and uploads to 25 MB. |
| Processing takes minutes | Expected: Panoscribe runs on the CPU. A 3-minute video took about 3.5 minutes on a MacBook Air. |

## Current project status

Verified on a local Mac with the live services: TikTok link extraction, reuse of
an earlier recipe, video upload, creator attribution, cover images, persistence
across restarts, and recovery after the worker is killed.

Only TikTok links are offered in the app. Not yet verified live: the browser
flow of signing in, saving, and publishing, which has automated tests only.

AI-generated amounts and times can be wrong; check them against the video.
There is no production deployment yet.

## Tests and checks

Run these from the repository root:

```sh
pnpm test
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

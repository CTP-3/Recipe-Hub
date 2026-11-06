<!--
This becomes YOUR project's README. When your project has a name:

    cp README.template.md README.md

…then fill every <placeholder>, delete these guidance comments, and land it
as a PR (a good first "docs rode along" PR). The starter's original README
always lives on in the template repo — you lose nothing by replacing it.
Everything not in <angle brackets> is already true of this codebase; keep it.
-->

# Recipe Hub

Recipe Hub helps home cooks and food lovers turn social media recipe links into organized, personalized collections with ingredients, nutritional values, instructions, equipment, and everything else you'd want from a recipe.

**Live:** not deployed yet

<!-- Optional but recommended: one screenshot or GIF of the thing working.
     A README with a picture gets read; a wall of text gets skimmed. -->

## What it does

<!-- One line per shipped feature, linking its spec — the spec is the full
     story, this list is the menu. Grows as features land. -->

- Import recipe links from social media and turn them into organized, structured recipes ([spec](docs/specs/<domain>/<feature>.md))
- <Feature> ([spec](docs/specs/<domain>/<feature>.md))

## Run it locally

No Docker or cloud account is needed. Video extraction also requires Python,
FFmpeg, and Ollama with the configured model available.

```bash
pnpm install
pnpm prisma:generate     # typed DB client
python3 -m pip install -r services/recipe-extraction/requirements.txt
pnpm dev                 # web + worker + your own Postgres + Azurite
pnpm db:seed             # demo data (with dev running)
```

Install FFmpeg and Ollama separately, then make sure Ollama is running and has
the `gemma3:1b` model (`ollama pull gemma3:1b`). `pnpm dev` starts the Python
extraction API, which runs Whisper for transcription.
Link inspection also requires an SMVD RapidAPI key in
`apps/web/.env.local`:

```dotenv
SMVD_RAPIDAPI_KEY=your-rapidapi-key
```

Restart `pnpm dev` after setting the key.

Check it worked: `http://localhost:3000/api/health` → `{"status":"ok","db":"ok"}`.
All commands: see `package.json` scripts, or `CONTRIBUTING.md` for the
pre-push set (`pnpm test && pnpm typecheck && pnpm build`).

## How it's built

The web app lets users save, browse, and organize recipe collections from imported links, while the background worker parses recipe content, extracts ingredients and steps, and keeps data fresh. The database stores users, recipes, ingredients, nutrition details, instructions, equipment, tags, and saved collections so everything can be searched, organized, and revisited in one place.

The deeper story lives in the docs, organized by the question you're asking —
decisions in [`docs/adr/`](docs/adr/), behavior in [`docs/specs/`](docs/specs/),
history in [`docs/postmortems/`](docs/postmortems/), procedures in
[`docs/runbooks/`](docs/runbooks/). Start at [`docs/README.md`](docs/README.md).

## Team

<!-- Who builds this. Link GitHubs. Your team charter has the roles. -->

- Olivia Jervise — @olivia-jervise
- Alyssa Johnson — @alyssajodi2005
- Nathan Jaywin Chin - @NathanASC25

## Contributing

Workflow, ground rules, and the documentation system: [`CONTRIBUTING.md`](CONTRIBUTING.md).
Agent conventions (any harness): [`AGENTS.md`](AGENTS.md).

---

<sub>Built on the CTP C12 full-stack starter — Next.js · Prisma · Postgres · Azure.</sub>

---
type: feature
---
# Recipe collection and creation share the My Recipes page

## Why
People can manage saved recipes and start recipe creation from one place.

## Where it lives
- `apps/web/app/my-recipes/page.tsx` — saved, created, and create tabs.
- `apps/web/components/RecipeCreator.tsx` — video and video-link recipe
  generation.
- `apps/web/app/upload/page.tsx` — redirects the legacy create route.
- `apps/web/components/Navbar.tsx` — Create and My Recipes navigation.

## Behavior
- My Recipes has Saved, Created, and Create tabs.
- Saved shows recipes saved in the browser or an empty state that links to
  discovery on Home.
- Created explains that generated recipes are not yet persisted.
- Create contains the existing video upload and video-link recipe-generation
  flow.
- The home page's Create a recipe action opens `/my-recipes?tab=create`. The
  Create tab is selected when that URL is opened.
- `/upload` redirects to `/my-recipes?tab=create`.
- The Create tab sends uploaded video to the authenticated Next.js extraction
  route as multipart form data. The server forwards it to the configured
  extraction service without exposing service credentials to the browser.
- The page displays a generated recipe only when the response contains a
  structured recipe with a title, ingredients array, and instructions array.
  It shows the description, ingredients, instructions, servings, prep and cook
  times, and any available equipment, temperature, and dietary tags.
- Extraction tries the Classroom AI `summarize` model with a strict recipe
  JSON schema first, then uses `generate` once if the response is truncated or
  invalid. The response is mapped to the existing recipe display shape, with
  ingredient estimate flags, original spoken wording, notes, and model tips
  preserved in the generated recipe view.
- The generated recipe is displayed in memory and is not saved to the recipe
  database. Existing saved-recipe behavior remains unchanged.
- Upload errors show the server's error message, including authentication,
  backend, invalid-response, and timeout errors. The selected video remains
  available for retry after a failed extraction.
- Extraction may take up to 15 minutes; the page stays in a loading state and
  prevents another submission while processing.
- The shared navigation contains Home and My Recipes, but no Create tab.
- The sign-in and sign-out action in the shared navigation is a person icon
  with an accessible name.
- The shared navigation has no Auth test link.

## Examples

| State / input | Behavior |
|---|---|
| Open `/my-recipes` | My Recipes opens on Saved. |
| Open `/my-recipes?tab=create` or `/upload` | My Recipes opens on Create. |
| Select Created | The page explains generated recipes are not persisted yet. |
| Submit a valid video while authenticated | The Create tab shows the returned structured recipe after extraction completes. |
| An ingredient amount is estimated | The display marks the amount as estimated and retains its spoken wording and explanatory note when available. |
| Submit a video while signed out | The page explains that authentication is required. |
| Extraction fails or times out | The page shows the returned error and allows retrying with the selected video. |
| OAuth is configured | Navigation shows an accessible person-icon sign-in or sign-out action. |
| Development mode | No Auth test navigation link is shown. |

## Verify
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- Open `/my-recipes`, switch through Saved, Created, and Create, and verify
  recipe generation controls appear in Create.
- Open `/upload` and use the home page's Create a recipe action; both land on
  My Recipes with Create selected.
- Upload a video under 25 MB while signed in and verify the loading state,
  structured recipe details, and dietary tags when present. Confirm a failed
  or timed-out request displays an error and can be retried.
- Confirm the navigation contains no Auth test link and the account icon has
  an accessible Sign in or Sign out name.

## Constraints & decisions
- Generated recipes remain in-memory and are not added to the saved recipe
  list; persistence is not part of this behavior.
- `/upload` remains as a redirect for existing links.
- The Auth test page remains available by direct URL in development, but is
  intentionally absent from shared navigation.

## Out of scope
- Persisting generated recipes or associating recipes with signed-in users is
  not part of this feature.

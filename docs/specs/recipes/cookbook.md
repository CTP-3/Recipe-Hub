---
type: feature
---
# Recipe collection and creation share the My Recipes page

## Why
People can manage saved recipes and start recipe creation from one place.

## Where it lives
- `apps/web/app/my-recipes/page.tsx` — saved, created, and create tabs.
- `apps/web/app/my-recipes/saved/[id]/page.tsx` — account-owned recipe details.
- `apps/web/app/api/recipes/saved/` — account-scoped list and save endpoints.
- `apps/web/app/api/recipes/saved/[id]/route.ts` — account-scoped detail and
  deletion endpoints.
- `apps/web/components/RecipeCreator.tsx` — video and video-link generation.
- `apps/web/components/SaveGeneratedRecipeButton.tsx` — authenticated save.
- `packages/domain/src/saved-recipes.ts` — validation and owner-scoped queries.
- `packages/db/prisma/schema.prisma` — saved recipe persistence.

## Behavior
- My Recipes has Saved, Created, and Create tabs.
- Saved shows account-persisted bookmarks and browser-local demo bookmarks.
- Created shows account-owned generated recipes. These recipes survive
  refreshes and open to full details; eligible link recipes can be published
  to or removed from Explore, and owners can explicitly regenerate them.
- Create contains the existing video upload and video-link recipe-generation
  flow. `/upload` redirects to `/my-recipes?tab=create`.
- Video inspection and recipe extraction work for signed-out visitors, who
  can preview results. Saving requires an Auth.js session.
- The server forwards extraction requests to the configured service without
  exposing service credentials to the browser. Classroom AI tries `summarize`
  first, then `generate` if the response is truncated or invalid.
- The page displays a structured recipe only when the response has a title,
  ingredient array, and instruction array. Known servings and prep/cook times
  are shown; unknown values are omitted.
- Ingredients show their name, quantity, and unit. Only model-estimated
  quantities carry an Estimated marker. Missing quantities display
  “Quantity not specified”; the frontend never invents amounts. Ingredient
  checkboxes support cooking progress, while spoken wording and notes are
  collapsed by default.
- Original wording, notes, instructions, tips, servings, times, source video,
  transcript, and OCR evidence remain in the saved recipe payload.
- Save Recipe is idempotent per user, recipe content, and source video.
  Signed-out users who
  request a save are sent through the existing Google sign-in flow; their
  generated recipe is restored in the Create tab after sign-in so they can
  complete the save.
- Saved recipe reads, details, and deletes are scoped to the current session
  user. Foreign and unknown recipes return 404.
- Saved recipe details show the complete recipe and collapsed transcript and
  OCR panels after the recipe content. The AI-generated recipe disclaimer
  remains near the bottom.
- The shared navigation contains Home and My Recipes, but no Create tab.
  Its person-icon sign-in and sign-out actions have accessible names; the
  Auth test link is absent.
- Extraction may take up to 15 minutes; the page stays in a loading state and
  prevents another submission while processing. Failures surface an error and
  allow retrying.

## Examples

| State / input | Behavior |
|---|---|
| Open `/my-recipes?tab=create` or `/upload` | My Recipes opens on Create. |
| Submit a valid video while signed out | The Create tab shows the returned structured recipe. |
| A known spoken amount is returned | The amount appears without Estimated; original wording is in collapsed details. |
| A model-estimated amount is returned | The amount is marked Estimated; wording and notes remain in collapsed details. |
| No usable amount is returned | The ingredient says Quantity not specified. |
| Save while signed out | Auth.js sign-in restores the recipe draft on return. |
| Save while signed in | The recipe appears in Created and remains after refresh. A repeated save does not create another bookmark. |
| Another user requests a saved recipe | The detail and delete routes return 404. |
| Extraction fails or times out | The page shows the error and allows retrying. |

## Verify
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and the recipe extraction
  Python tests.
- Open `/my-recipes`, switch through Saved, Created, and Create, and verify
  recipe generation controls appear in Create.
- Upload a video under 25 MB while signed out and verify the loading state and
  structured recipe details; confirm failures display an error and can retry.
- Verify quantities, estimated flags, spoken wording, and notes using a
  structured extraction fixture. Expand and collapse ingredient details,
  transcript, and OCR.
- Save while signed in, refresh My Recipes, open the saved recipe and remove
  its bookmark, verify duplicate saves are idempotent, and verify another
  account receives 404.
- Verify Created lists only the signed-in user's generated recipes; publish,
  unpublish, and regenerate an owned link recipe, and confirm a foreign owner
  cannot access or manage it.
- Confirm the navigation contains no Auth test link and the account icon has
  an accessible Sign in or Sign out name.

## Constraints & decisions
- Generated recipe data is stored as a validated JSON payload in a separate
  user-owned SavedRecipe record so estimate, wording, and note data do not
  have to fit the legacy normalized ingredient model.
- Existing demo bookmarks remain browser-local in Saved and separate from
  account-owned generated recipes in Created. Generated recipe bookmarks are
  persisted separately from recipe ownership.
- `/upload` remains as a redirect for existing links.
- The Auth test page remains available by direct URL in development, but is
  intentionally absent from shared navigation.

## Out of scope
- Editing saved recipe content is not part of this behavior.

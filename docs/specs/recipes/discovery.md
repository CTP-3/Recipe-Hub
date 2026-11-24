---
type: feature
---
# Recipe discovery lives on the home page

## Why
People can find a recipe, filter by meal type, or search ingredients without
leaving the home page.

## Where it lives
- `apps/web/app/home/page.tsx` — home page discovery and recipe browsing.
- `apps/web/components/Navbar.tsx` — primary navigation.
- `apps/web/app/recipes/[id]/page.tsx` — recipe detail return link.

## Behavior
- The home page shows published video recipes and a separate demo recipe
  catalog with a search field and category filters for All, Video recipe,
  breakfast, lunch, dinner, and dessert.
- Search is case-insensitive. Demo recipes match title, description, and
  ingredients; published video recipes match title, description, and source
  platform. The selected category and search term both apply.
- Published video recipes are loaded from the server in pages and appear only
  after their owner explicitly publishes them. Private recipes and uploads
  never appear in Explore.
- A search with no matches displays a message instead of recipe cards.
- The hero's Explore recipes link and recipe browsing links point to the
  discovery section on the home page.
- The primary navigation has no separate Discover tab or route.
- Selecting a recipe opens its detail page; the detail page links back to the
  home page's discovery section.

## Examples

| State / input | Behavior |
|---|---|
| Home page with an empty search and All selected | Published video recipes and demo cards appear in separate sections. |
| Search for `tomato` with All selected | Matching published titles/descriptions and demo titles/descriptions/ingredients appear. |
| Video recipe selected while searching | Only matching published video recipes appear. |
| Dinner selected while searching for `tomato` | Only matching dinner demo recipes appear. |
| Search for a term with no matches | A no-recipes-found message appears. |

## Verify
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- On `/home`, verify the published video and demo sections, search each by
  recipe name and ingredient where supported, select categories, and verify
  results and the empty state; use Explore recipes and check the URL fragment.
- Confirm `/discover` is no longer a page and the navigation has no Discover
  tab.

## Constraints & decisions
- Demo discovery uses the existing local recipe list. Published video recipes
  use the owner-scoped publication API and cursor pagination.
- Recipe filtering stays on the home page; the existing recipe detail pages
  remain separate.

## Out of scope
- Saving recipes is covered by the cookbook feature; this spec does not define
  that behavior.

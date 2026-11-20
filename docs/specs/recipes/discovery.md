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
- The home page shows the available recipes with a search field and category
  filters for all recipes, breakfast, lunch, dinner, and dessert.
- Search matches recipe titles, descriptions, and ingredients without regard
  to letter case; the selected category and search term both apply.
- A search with no matches displays a message instead of recipe cards.
- The hero's Explore recipes link and recipe browsing links point to the
  discovery section on the home page.
- The primary navigation has no separate Discover tab or route.
- Selecting a recipe opens its detail page; the detail page links back to the
  home page's discovery section.

## Examples

| State / input | Behavior |
|---|---|
| Home page with an empty search and All selected | All available recipe cards appear. |
| Search for `tomato` with All selected | Recipes whose title, description, or ingredients include tomato appear. |
| Dinner selected while searching for `tomato` | Only matching dinner recipes appear. |
| Search for a term with no matches | A no-recipes-found message appears. |

## Verify
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- On `/home`, search by recipe name and ingredient, select a category, and verify
  the results and empty state; use the Explore recipes link and check the URL
  fragment.
- Confirm `/discover` is no longer a page and the navigation has no Discover
  tab.

## Constraints & decisions
- Discovery uses the existing demo recipe list and does not add a remote search
  or a database query.
- Recipe filtering stays on the home page; the existing recipe detail pages
  remain separate.

## Out of scope
- Saving recipes is covered by the cookbook feature; this spec does not define
  that behavior.

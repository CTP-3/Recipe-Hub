import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../packages/auth/src/auth", () => ({ auth: vi.fn() }));
vi.mock("../../packages/domain/src/index", () => ({
  listSavedRecipesForUser: vi.fn(),
  saveRecipeForUser: vi.fn(),
  savedRecipePayloadSchema: { safeParse: vi.fn() },
}));

import { auth } from "../../packages/auth/src/auth";
import {
  GET as listSavedRecipes,
  POST as saveRecipe,
} from "../../apps/web/app/api/recipes/saved/route";

describe("protected API routes", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(auth).mockResolvedValue(null);
  });

  it("requires authentication to list saved recipes", async () => {
    const response = await listSavedRecipes();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("requires authentication to save a recipe", async () => {
    const response = await saveRecipe(
      new Request("http://localhost/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});

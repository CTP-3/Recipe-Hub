import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  getRecipe: vi.fn(),
  download: vi.fn(),
}));

vi.mock("../packages/auth/src/auth", () => ({
  auth: vi.fn(async () =>
    state.userId ? { user: { id: state.userId } } : null,
  ),
}));
vi.mock("@project/domain", () => ({
  getGeneratedRecipeForUser: state.getRecipe,
}));
vi.mock("../packages/services/src/index", () => ({
  downloadAttachment: state.download,
}));

import { GET } from "../apps/web/app/api/recipes/media/[recipeId]/route";

beforeEach(() => {
  state.userId = null;
  state.getRecipe.mockReset().mockResolvedValue({
    id: "generated-id",
    coverImageKey: "source-id/cover.jpg",
    visibility: "PRIVATE",
  });
  state.download.mockReset().mockResolvedValue({
    data: new Uint8Array([0xff, 0xd8, 0xff]),
    contentType: "image/jpeg",
  });
});

describe("GET /api/recipes/media/[recipeId]", () => {
  it("serves a private guest-generated cover only with its job access token", async () => {
    const accessToken = "a".repeat(43);
    const response = await GET(
      new Request(
        `http://localhost/api/recipes/media/generated-id?accessToken=${accessToken}`,
      ),
      { params: Promise.resolve({ recipeId: "generated-id" }) },
    );

    expect(state.getRecipe).toHaveBeenCalledWith(
      "generated-id",
      null,
      accessToken,
    );
    expect(state.download).toHaveBeenCalledWith("source-id/cover.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("returns not found for a missing or invalid image credential", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/recipes/media/generated-id?accessToken=invalid",
      ),
      { params: Promise.resolve({ recipeId: "generated-id" }) },
    );

    expect(response.status).toBe(404);
    expect(state.getRecipe).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
  });

  it("reports storage failures instead of mislabeling them as a missing image", async () => {
    state.userId = "recipe-owner";
    state.download.mockRejectedValue(new Error("storage unavailable"));
    const response = await GET(
      new Request("http://localhost/api/recipes/media/generated-id"),
      { params: Promise.resolve({ recipeId: "generated-id" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });
});

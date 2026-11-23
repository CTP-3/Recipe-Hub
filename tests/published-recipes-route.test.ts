import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listPublishedRecipes: vi.fn(),
}));

vi.mock("@project/domain", () => ({
  listPublishedRecipes: state.listPublishedRecipes,
}));

import { GET } from "../apps/web/app/api/recipes/published/route";

beforeEach(() => {
  state.listPublishedRecipes.mockReset().mockResolvedValue({
    recipes: [
      {
        id: "published-recipe",
        title: "Creamy One Pot Soup",
        recipe: { description: "A cozy soup." },
        coverImageKey: "cover.jpg",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        videoSource: {
          platform: "tiktok",
          canonicalUrl: "https://www.tiktok.com/@recipechef/video/123456789",
          videoId: "123456789",
          sourcePlatform: "tiktok",
          sourceVideoUrl:
            "https://www.tiktok.com/@recipechef/video/123456789",
          sourceVideoId: "123456789",
          sourceCreatorUsername: "recipechef",
          sourceCreatorName: "Recipe Chef",
          sourceCreatorProfileUrl: "https://www.tiktok.com/@recipechef",
        },
      },
    ],
    nextCursor: null,
  });
});

describe("GET /api/recipes/published", () => {
  it("returns original video and creator attribution for Explore cards", async () => {
    const response = await GET(
      new Request("http://localhost/api/recipes/published?limit=12"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recipes: [
        {
          id: "published-recipe",
          sourcePlatform: "tiktok",
          sourceVideoUrl:
            "https://www.tiktok.com/@recipechef/video/123456789",
          sourceVideoId: "123456789",
          sourceCreatorUsername: "recipechef",
          sourceCreatorName: "Recipe Chef",
          sourceCreatorProfileUrl: "https://www.tiktok.com/@recipechef",
        },
      ],
    });
  });
});

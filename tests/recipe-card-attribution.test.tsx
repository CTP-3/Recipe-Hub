import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RecipeCard from "../apps/web/components/RecipeCard";

describe("Explore recipe attribution", () => {
  it("links the original creator profile and source video separately from the recipe card", () => {
    const markup = renderToStaticMarkup(
      <RecipeCard
        recipe={{
          id: "published-recipe",
          title: "Creamy One Pot Soup",
          image: "/soup.jpg",
          sourcePlatform: "tiktok",
          sourceVideoUrl:
            "https://www.tiktok.com/@recipechef/video/123456789",
          sourceCreatorUsername: "recipechef",
          sourceCreatorName: "Recipe Chef",
          sourceCreatorProfileUrl: "https://www.tiktok.com/@recipechef",
        }}
      />,
    );

    expect(markup).toContain("Original recipe video by");
    expect(markup).toContain('href="https://www.tiktok.com/@recipechef"');
    expect(markup).toContain(
      'href="https://www.tiktok.com/@recipechef/video/123456789"',
    );
    expect(markup).toContain("TikTok · Watch Original Video");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it("shows a clear fallback when the external service provides no creator data", () => {
    const markup = renderToStaticMarkup(
      <RecipeCard
        recipe={{
          id: "published-recipe",
          title: "Creamy One Pot Soup",
          image: "/soup.jpg",
          sourcePlatform: "tiktok",
          sourceVideoUrl:
            "https://www.tiktok.com/@recipechef/video/123456789",
          sourceCreatorUsername: null,
          sourceCreatorName: null,
          sourceCreatorProfileUrl: null,
        }}
      />,
    );

    expect(markup).toContain("Original creator unavailable");
    expect(markup).toContain("TikTok · Watch Original Video");
  });
});

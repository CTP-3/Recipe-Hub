import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RecipeCoverImage from "../apps/web/components/RecipeCoverImage";

describe("recipe cover image fallback", () => {
  it("does not render a broken image element when no cover is available", () => {
    const markup = renderToStaticMarkup(
      <RecipeCoverImage
        src={null}
        alt="Cover image for Jamaican Meatloaf"
        className="aspect-video w-full"
      />,
    );

    expect(markup).not.toContain("<img");
    expect(markup).toContain("Cover image unavailable.");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractRecipeFromLink,
  extractRecipeFromUpload,
  LINK_VIDEO_TOO_LARGE_MESSAGE,
} from "../packages/services/src/recipe-extraction";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recipe extraction service size errors", () => {
  it("reports the maximum size for an oversized linked video", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { detail: LINK_VIDEO_TOO_LARGE_MESSAGE },
        { status: 413 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractRecipeFromLink(
        "https://edge-api-v3.smvd.xyz/rproxy/video",
        "Recipe video",
      ),
    ).rejects.toThrow(LINK_VIDEO_TOO_LARGE_MESSAGE);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: "http://127.0.0.1:8001/extract-link" }),
      expect.any(Object),
    );
  });

  it("keeps the existing 25 MB maximum clear for uploaded videos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ detail: "uploaded video is too large" }, { status: 413 }),
      ),
    );

    await expect(
      extractRecipeFromUpload(new Uint8Array([1]), "recipe.mp4"),
    ).rejects.toThrow(
      "Uploaded video exceeds the 25 MB limit. Choose a video no larger than 25 MB.",
    );
  });

  it("preserves safe extraction-service error details from JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { detail: "Panoscribe API request failed." },
          { status: 502 },
        ),
      ),
    );

    await expect(
      extractRecipeFromLink(
        "https://edge-api-v3.smvd.xyz/rproxy/video",
        "Recipe video",
      ),
    ).rejects.toThrow("Panoscribe API request failed.");
  });

  it("reports the HTTP status when an upstream proxy returns a non-JSON error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html>upstream error</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(
      extractRecipeFromLink(
        "https://edge-api-v3.smvd.xyz/rproxy/video",
        "Recipe video",
      ),
    ).rejects.toThrow("Recipe extraction failed (HTTP 502).");
  });
});

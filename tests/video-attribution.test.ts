import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceCreatorMetadata } from "../apps/web/lib/inspect-video";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("source creator metadata", () => {
  it("resolves TikTok short links safely and uses public oEmbed attribution", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://www.tiktok.com/@recipechef/video/7480001234567890123?tracking=1",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          author_name: "Recipe Chef",
          author_url: "https://www.tiktok.com/@recipechef",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await fetchSourceCreatorMetadata(
      "https://www.tiktok.com/t/ZPNFKxegp/",
    );

    expect(metadata).toEqual({
      sourcePlatform: "tiktok",
      sourceVideoUrl:
        "https://www.tiktok.com/@recipechef/video/7480001234567890123",
      sourceVideoId: "7480001234567890123",
      sourceCreatorUsername: "recipechef",
      sourceCreatorName: "Recipe Chef",
      sourceCreatorProfileUrl: "https://www.tiktok.com/@recipechef",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const oembedUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(oembedUrl.origin + oembedUrl.pathname).toBe(
      "https://www.tiktok.com/oembed",
    );
    expect(oembedUrl.searchParams.get("url")).toBe(metadata.sourceVideoUrl);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: "manual",
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      redirect: "error",
    });
  });

  it("extracts TikTok creator attribution when oEmbed and provider data are combined", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        author_name: "Original Cook",
        author_url: "https://www.tiktok.com/@originalcook",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await fetchSourceCreatorMetadata(
      "https://www.tiktok.com/@originalcook/video/7480001234567890123",
      { author_unique_id: "originalcook", nickname: "Original Cook" },
    );

    expect(metadata).toMatchObject({
      sourceCreatorUsername: "originalcook",
      sourceCreatorName: "Original Cook",
      sourceCreatorProfileUrl: "https://www.tiktok.com/@originalcook",
      sourceVideoUrl:
        "https://www.tiktok.com/@originalcook/video/7480001234567890123",
    });
  });

  it("retains the canonical TikTok link when public attribution metadata is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("unavailable", { status: 403 }),
      ),
    );

    const metadata = await fetchSourceCreatorMetadata(
      "https://www.tiktok.com/@chef/video/123456789",
      {},
    );

    expect(metadata).toMatchObject({
      sourcePlatform: "tiktok",
      sourceVideoUrl: "https://www.tiktok.com/@chef/video/123456789",
      sourceCreatorUsername: null,
      sourceCreatorName: null,
      sourceCreatorProfileUrl: null,
    });
  });

  it("uses YouTube's public oEmbed and keeps creator fields nullable when unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          author_name: "Home Cook",
          author_url: "https://www.youtube.com/@homecook",
        }),
      )
      .mockResolvedValueOnce(
        new Response("unavailable", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const youtube = await fetchSourceCreatorMetadata(
      "https://youtu.be/abcdefghijk",
    );
    const missing = await fetchSourceCreatorMetadata(
      "https://www.tiktok.com/@chef/video/123456789",
    );

    expect(youtube).toMatchObject({
      sourcePlatform: "youtube",
      sourceVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      sourceVideoId: "abcdefghijk",
      sourceCreatorUsername: "homecook",
      sourceCreatorName: "Home Cook",
      sourceCreatorProfileUrl: "https://www.youtube.com/@homecook",
    });
    expect(missing).toMatchObject({
      sourcePlatform: "tiktok",
      sourceVideoId: "123456789",
      sourceCreatorUsername: null,
      sourceCreatorName: null,
      sourceCreatorProfileUrl: null,
    });
  });

  it("uses the existing Instagram inspection metadata without guessing creator identity", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const metadata = await fetchSourceCreatorMetadata(
      "https://www.instagram.com/reel/AbC123/",
      {
        user: {
          username: "recipechef",
          full_name: "Recipe Chef",
          profile_url: "https://www.instagram.com/recipechef/",
        },
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(metadata).toMatchObject({
      sourcePlatform: "instagram",
      sourceVideoUrl: "https://www.instagram.com/p/AbC123/",
      sourceVideoId: "AbC123",
      sourceCreatorUsername: "recipechef",
      sourceCreatorName: "Recipe Chef",
      sourceCreatorProfileUrl: "https://www.instagram.com/recipechef/",
    });
  });

  it("does not fetch an unsupported metadata URL or trust an unsafe profile URL", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSourceCreatorMetadata("https://example.com/@creator/video/123"),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    const metadata = await fetchSourceCreatorMetadata(
      "https://www.tiktok.com/@chef/video/123456789",
      {
        author_unique_id: "chef",
        author_name: "Chef",
        author_url: "https://evil.example/redirect",
      },
    );
    expect(metadata.sourceCreatorProfileUrl).toBe(
      "https://www.tiktok.com/@chef",
    );
  });
});

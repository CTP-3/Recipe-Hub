import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSupportedVideoUrl,
  parseVideoUrl,
} from "@project/domain/video-url";
import { inspectVideoUrl } from "../apps/web/lib/inspect-video";

const originalApiKey = process.env.SMVD_RAPIDAPI_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) {
    delete process.env.SMVD_RAPIDAPI_KEY;
  } else {
    process.env.SMVD_RAPIDAPI_KEY = originalApiKey;
  }
});

describe("shared video URL validation", () => {
  it.each([
    ["YouTube watch", "https://www.youtube.com/watch?v=abcdefghijk", "youtube"],
    ["YouTube Shorts", "https://youtube.com/shorts/abcdefghijk", "youtube"],
    ["YouTube short host", "https://youtu.be/abcdefghijk?t=10", "youtube"],
    [
      "TikTok canonical",
      "https://www.tiktok.com/@chef/video/123456789?is_from_webapp=1",
      "tiktok",
    ],
    ["TikTok video path", "https://m.tiktok.com/video/123456789", "tiktok"],
    ["TikTok share path", "https://www.tiktok.com/t/ZTAbCdEf/", "tiktok"],
    ["TikTok short host", "https://vm.tiktok.com/ZMAbCdEf/", "tiktok"],
    [
      "Instagram Reel",
      "https://www.instagram.com/reel/AbC123/?igsh=tracking",
      "instagram",
    ],
  ])("recognizes %s", (_label, input, platform) => {
    const parsed = parseVideoUrl(input);
    expect(parsed?.platform).toBe(platform);
    expect(isSupportedVideoUrl(input)).toBe(true);
  });

  it.each([
    "http://www.tiktok.com/@chef/video/123456789",
    "https://www.tiktok.com.evil.example/@chef/video/123456789",
    "https://user:pass@www.tiktok.com/@chef/video/123456789",
    "https://www.tiktok.com:8443/@chef/video/123456789",
    "https://www.tiktok.com/@chef/video/123abc",
    "https://www.youtube.com/watch?v=invalid",
    "https://www.instagram.com/stories/chef/12345/",
    "https://example.com/video/123456789",
  ])("rejects invalid or unsupported URL %s", (input) => {
    expect(parseVideoUrl(input)).toBeNull();
    expect(isSupportedVideoUrl(input)).toBe(false);
  });

  it("rejects URLs containing credentials", () => {
    const url = new URL("https://www.tiktok.com/@chef/video/123456789");
    url.username = "user";
    url.password = "pass";

    expect(parseVideoUrl(url.toString())).toBeNull();
  });
});

describe("platform-specific video inspection", () => {
  it.each([
    [
      "YouTube watch",
      "https://www.youtube.com/watch?v=abcdefghijk",
      "/youtube/v3/video/details",
      "videoId",
    ],
    [
      "YouTube Shorts",
      "https://www.youtube.com/shorts/abcdefghijk",
      "/youtube/v3/video/details",
      "videoId",
    ],
    [
      "YouTube short host",
      "https://youtu.be/abcdefghijk",
      "/youtube/v3/video/details",
      "videoId",
    ],
    [
      "TikTok",
      "https://www.tiktok.com/@chef/video/123456789",
      "/tiktok/v3/post/details",
      "url",
    ],
    [
      "Instagram Reel",
      "https://www.instagram.com/p/AbC123/",
      "/instagram/v3/media/post/details",
      "shortcode",
    ],
  ])("routes %s to its own provider endpoint", async (_label, input, path, key) => {
    process.env.SMVD_RAPIDAPI_KEY = "test-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({ contents: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await inspectVideoUrl(input);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const endpoint = new URL(String(fetchMock.mock.calls[0][0]));
    expect(endpoint.pathname).toBe(path);
    if (key === "videoId") {
      expect(endpoint.searchParams.get(key)).toBe("abcdefghijk");
    }
    if (key === "shortcode") {
      expect(endpoint.searchParams.get(key)).toBe("AbC123");
    }
  });

  it("does not fetch an unsupported URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await inspectVideoUrl("https://example.com/video");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

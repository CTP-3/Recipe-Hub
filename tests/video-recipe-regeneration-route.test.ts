import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "recipe-owner" as string | null,
  source: {
    id: "source-id",
    canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  } as { id: string; canonicalUrl: string } | null,
  queueRegeneration: vi.fn(),
  inspectVideoUrl: vi.fn(),
  getDownloadableVideo: vi.fn(),
  enqueue: vi.fn(),
  getSource: vi.fn(),
  failSource: vi.fn(),
  updateAttribution: vi.fn(),
  fetchAttribution: vi.fn(),
}));

vi.mock("../packages/auth/src/auth", () => ({
  auth: vi.fn(async () =>
    state.userId ? { user: { id: state.userId } } : null,
  ),
}));
vi.mock("@project/domain", () => ({
  queueRecipeRegeneration: state.queueRegeneration,
  getVideoSourceForWorker: state.getSource,
  failVideoSource: state.failSource,
  updateVideoSourceAttribution: state.updateAttribution,
}));
vi.mock("../packages/services/src/queue", () => ({
  enqueue: state.enqueue,
}));
vi.mock("../apps/web/lib/inspect-video", () => ({
  inspectVideoUrl: state.inspectVideoUrl,
  getDownloadableVideo: state.getDownloadableVideo,
  fetchSourceCreatorMetadata: state.fetchAttribution,
}));

import { POST } from "../apps/web/app/api/recipes/jobs/[sourceId]/regenerate/route";

const context = { params: Promise.resolve({ sourceId: "source-id" }) };

beforeEach(() => {
  state.userId = "recipe-owner";
  state.source = {
    id: "source-id",
    canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  };
  state.queueRegeneration.mockReset().mockImplementation(async () => state.source);
  state.inspectVideoUrl
    .mockReset()
    .mockResolvedValue(
      Response.json({ result: { contents: [{ videos: [{ url: "video-url" }] }] } }),
    );
  state.getDownloadableVideo
    .mockReset()
    .mockReturnValue({ url: "https://edge-api-v3.smvd.xyz/rproxy/video", description: "video" });
  state.enqueue.mockReset().mockResolvedValue(undefined);
  state.getSource.mockReset().mockResolvedValue({ id: "source-id", status: "QUEUED" });
  state.failSource.mockReset().mockResolvedValue({ count: 1 });
  state.fetchAttribution.mockReset().mockResolvedValue({
    sourcePlatform: "youtube",
    sourceVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    sourceVideoId: "abcdefghijk",
    sourceCreatorUsername: "chef",
    sourceCreatorName: "Chef",
    sourceCreatorProfileUrl: "https://www.youtube.com/@chef",
  });
  state.updateAttribution.mockReset().mockResolvedValue({});
});

describe("video recipe regeneration route", () => {
  it("requires authentication", async () => {
    state.userId = null;
    const response = await POST(
      new Request("http://localhost/api/recipes/jobs/source-id/regenerate", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(401);
    expect(state.queueRegeneration).not.toHaveBeenCalled();
  });

  it("returns not found when the recipe is not owned by the current user", async () => {
    state.queueRegeneration.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/recipes/jobs/source-id/regenerate", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(404);
    expect(state.inspectVideoUrl).not.toHaveBeenCalled();
  });

  it("queues regeneration for an owned recipe", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipes/jobs/source-id/regenerate", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(state.queueRegeneration).toHaveBeenCalledWith(
      "recipe-owner",
      "source-id",
    );
    expect(state.enqueue).toHaveBeenCalledWith("recipe.extraction", {
      sourceId: "source-id",
      downloadUrl: "https://edge-api-v3.smvd.xyz/rproxy/video",
      description: "video",
    });
  });

  it("marks the job failed when the source video is unavailable", async () => {
    state.inspectVideoUrl.mockResolvedValue(
      Response.json({ error: "unavailable" }, { status: 502 }),
    );
    const response = await POST(
      new Request("http://localhost/api/recipes/jobs/source-id/regenerate", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(502);
    expect(state.failSource).toHaveBeenCalledWith(
      "source-id",
      "The video could not be inspected.",
    );
  });
});

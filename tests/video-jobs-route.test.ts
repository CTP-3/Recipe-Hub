import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { LINK_VIDEO_TOO_LARGE_MESSAGE } from "../packages/services/src/recipe-extraction";

const routeState = vi.hoisted(() => ({
  userId: `video-job-requester-${process.pid}` as string | null,
  enqueue: vi.fn(),
  inspectVideoUrl: vi.fn(),
  getDownloadableVideo: vi.fn(),
  fetchSourceCreatorMetadata: vi.fn(),
}));

vi.mock("../packages/auth/src/auth", () => ({
  auth: vi.fn(async () =>
    routeState.userId ? { user: { id: routeState.userId } } : null,
  ),
}));
vi.mock("../packages/services/src/queue", () => ({
  enqueue: routeState.enqueue,
}));
vi.mock("../apps/web/lib/inspect-video", () => ({
  inspectVideoUrl: routeState.inspectVideoUrl,
  getDownloadableVideo: routeState.getDownloadableVideo,
  fetchSourceCreatorMetadata: routeState.fetchSourceCreatorMetadata,
}));

type VideoRecipeDomain = typeof import("@project/domain");
type PrismaClient = import("@project/db").PrismaClient;

let domain: VideoRecipeDomain;
let prisma: PrismaClient;
let post: typeof import("../apps/web/app/api/recipes/jobs/route").POST;
let getStatus: typeof import("../apps/web/app/api/recipes/jobs/[sourceId]/route").GET;
const ownerId = "video-job-private-owner";
const requesterId = `video-job-requester-${process.pid}`;

beforeAll(async () => {
  process.env.PGLITE_DATA_DIR = "memory://";
  delete process.env.DATABASE_URL;
  domain = await import("@project/domain");
  ({ POST: post } = await import("../apps/web/app/api/recipes/jobs/route"));
  ({ GET: getStatus } = await import(
    "../apps/web/app/api/recipes/jobs/[sourceId]/route"
  ));
  const db = await import("@project/db");
  prisma = db.prisma;
  await prisma.user.upsert({
    where: { id: ownerId },
    create: { id: ownerId },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: requesterId },
    create: { id: requesterId },
    update: {},
  });
}, 30_000);

beforeEach(() => {
  routeState.userId = requesterId;
  routeState.enqueue.mockReset().mockResolvedValue(undefined);
  routeState.inspectVideoUrl
    .mockReset()
    .mockResolvedValue(Response.json({ result: {} }));
  routeState.getDownloadableVideo
    .mockReset()
    .mockReturnValue({
      url: "https://edge-api-v3.smvd.xyz/rproxy/video",
      description: "video",
    });
  routeState.fetchSourceCreatorMetadata.mockReset().mockImplementation(
    async (url: string) => ({
      sourcePlatform: "tiktok",
      sourceVideoUrl: url,
      sourceVideoId: url.match(/\/video\/(\d+)/)?.[1] ?? "",
      sourceCreatorUsername: "cook",
      sourceCreatorName: "Cook",
      sourceCreatorProfileUrl: "https://www.tiktok.com/@cook",
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/recipes/jobs", () => {
  it("queues a separate owner-scoped job instead of returning 404 for another user's private source", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      `https://www.tiktok.com/@cook/video/${Date.now()}${process.pid}`,
    );
    const privateSource = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: ownerId,
      accessToken: domain.createVideoAccessToken(),
    });
    await domain.markVideoSourceProcessing(privateSource.source.id);
    await domain.completeVideoSource(privateSource.source.id, {
      recipe: {
        title: "Private recipe",
        ingredients: [],
        instructions: ["Cook."],
      },
    });

    const response = await post(
      new Request("http://localhost/api/recipes/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceInfo.originalUrl }),
      }),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "queued", queued: true });
    expect(body).toHaveProperty("sourceId");
    if (
      !body ||
      typeof body !== "object" ||
      !("sourceId" in body) ||
      typeof body.sourceId !== "string"
    ) {
      throw new Error("Recipe job response did not contain a source ID.");
    }
    expect(body.sourceId).not.toBe(privateSource.source.id);
    expect(routeState.inspectVideoUrl).toHaveBeenCalledWith(
      sourceInfo.canonicalUrl,
    );
    expect(routeState.enqueue).toHaveBeenCalledWith("recipe.extraction", {
      sourceId: body.sourceId,
      downloadUrl: "https://edge-api-v3.smvd.xyz/rproxy/video",
      description: "video",
    });
  });

  it("creates a token-scoped guest extraction job when a private source already exists", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      `https://www.tiktok.com/@cook/video/${Date.now()}${process.pid}77`,
    );
    const privateSource = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: ownerId,
      accessToken: domain.createVideoAccessToken(),
    });
    await domain.markVideoSourceProcessing(privateSource.source.id);
    await domain.completeVideoSource(privateSource.source.id, {
      recipe: {
        title: "Owner-only recipe",
        ingredients: [],
        instructions: ["Cook."],
      },
    });
    routeState.userId = null;

    const response = await post(
      new Request("http://localhost/api/recipes/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceInfo.originalUrl }),
      }),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "queued", queued: true });
    expect(body).toHaveProperty("sourceId");
    if (
      !body ||
      typeof body !== "object" ||
      !("sourceId" in body) ||
      typeof body.sourceId !== "string"
    ) {
      throw new Error("Recipe job response did not contain a source ID.");
    }
    const guestSource = await domain.getVideoSourceForWorker(body.sourceId);
    expect(guestSource).toMatchObject({ requestedById: null, status: "QUEUED" });
    expect(guestSource?.id).not.toBe(privateSource.source.id);
    expect(routeState.inspectVideoUrl).toHaveBeenCalledWith(
      sourceInfo.canonicalUrl,
    );
    expect(routeState.enqueue).toHaveBeenCalledWith("recipe.extraction", {
      sourceId: body.sourceId,
      downloadUrl: "https://edge-api-v3.smvd.xyz/rproxy/video",
      description: "video",
    });
  });

  it("returns an explicit unavailable-video error instead of a recipe-not-found error", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      `https://www.tiktok.com/@cook/video/${Date.now()}${process.pid}88`,
    );
    routeState.inspectVideoUrl.mockResolvedValue(
      Response.json(
        {
          error: {
            code: "VIDEO_UNAVAILABLE",
            message:
              "The video is unavailable from the source platform. Confirm the link is public and try again.",
          },
        },
        { status: 404 },
      ),
    );

    const response = await post(
      new Request("http://localhost/api/recipes/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceInfo.originalUrl }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VIDEO_UNAVAILABLE",
        message:
          "The video is unavailable from the source platform. Confirm the link is public and try again.",
      },
    });
    expect(routeState.enqueue).not.toHaveBeenCalled();
  });

  it("resolves TikTok share links before inspecting and queuing them", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.tiktok.com/@cook/video/1234567899876543210?share=1",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await post(
      new Request("http://localhost/api/recipes/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://www.tiktok.com/t/ShareCode/" }),
      }),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "queued", queued: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(routeState.inspectVideoUrl).toHaveBeenCalledWith(
      "https://www.tiktok.com/@cook/video/1234567899876543210",
    );
  });

  describe("GET /api/recipes/jobs/[sourceId]", () => {
    it("shows the supported maximum when a linked video exceeds the download limit", async () => {
      const sourceInfo = await domain.normalizeVideoUrl(
        `https://www.tiktok.com/@cook/video/${Date.now()}${process.pid}99`,
      );
      const job = await domain.createOrReuseVideoSource({
        ...sourceInfo,
        requestedById: requesterId,
        accessToken: domain.createVideoAccessToken(),
      });
      await domain.failVideoSource(job.source.id, LINK_VIDEO_TOO_LARGE_MESSAGE);

      const response = await getStatus(
        new Request("http://localhost/api/recipes/jobs/status"),
        { params: Promise.resolve({ sourceId: job.source.id }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "failed",
        error: LINK_VIDEO_TOO_LARGE_MESSAGE,
      });
    });

    it("shows a safe extraction-service failure reason", async () => {
      const sourceInfo = await domain.normalizeVideoUrl(
        `https://www.tiktok.com/@cook/video/${Date.now()}${process.pid}98`,
      );
      const job = await domain.createOrReuseVideoSource({
        ...sourceInfo,
        requestedById: requesterId,
        accessToken: domain.createVideoAccessToken(),
      });
      await domain.failVideoSource(job.source.id, "Panoscribe API request failed.");

      const response = await getStatus(
        new Request("http://localhost/api/recipes/jobs/status"),
        { params: Promise.resolve({ sourceId: job.source.id }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "failed",
        error: "Panoscribe API request failed.",
      });
    });

    it("does not expose unexpected internal failure details", async () => {
      const sourceInfo = await domain.normalizeVideoUrl(
        `https://www.tiktok.com/@cook/video/${Date.now()}${process.pid}97`,
      );
      const job = await domain.createOrReuseVideoSource({
        ...sourceInfo,
        requestedById: requesterId,
        accessToken: domain.createVideoAccessToken(),
      });
      await domain.failVideoSource(job.source.id, "/private/path/to/video.mp4");

      const response = await getStatus(
        new Request("http://localhost/api/recipes/jobs/status"),
        { params: Promise.resolve({ sourceId: job.source.id }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "failed",
        error: "Recipe extraction failed. Retry the extraction.",
      });
    });
  });
});

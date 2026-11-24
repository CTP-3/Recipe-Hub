import { beforeAll, describe, expect, it, vi } from "vitest";
import { runExtractionWithRetry } from "../apps/worker/src/extraction-retry";
import { fetchSourceCreatorMetadata, getDownloadableVideo } from "../apps/web/lib/inspect-video";

let domain: typeof import("@project/domain");
let prisma: import("@project/db").PrismaClient;
const userId = "recovery-user";
const otherId = "recovery-other";
let sequence = 0;

beforeAll(async () => {
  process.env.PGLITE_DATA_DIR = "memory://";
  delete process.env.DATABASE_URL;
  domain = await import("@project/domain");
  ({ prisma } = await import("@project/db"));
  for (const id of [userId, otherId]) await prisma.user.create({ data: { id } });
}, 30_000);

async function video() {
  sequence += 1;
  return domain.normalizeVideoUrl(`https://www.tiktok.com/@cook/video/99000${sequence}`);
}

async function submit(
  info: Awaited<ReturnType<typeof video>>,
  requestedById: string | null,
  accessToken = domain.createVideoAccessToken(),
) {
  return domain.createOrReuseVideoSource({ ...info, requestedById, accessToken });
}

async function finish(id: string) {
  await domain.markVideoSourceProcessing(id);
  return domain.completeVideoSource(id, {
    recipe: { title: "Meatloaf", ingredients: [], instructions: ["Bake."] },
    coverImageKey: `${id}/cover.jpg`,
  });
}

const age = (id: string, ms: number) =>
  prisma.videoSource.update({
    where: { id },
    data: { statusUpdatedAt: new Date(Date.now() - ms) },
  });

describe("reusing finished extractions", () => {
  it("gives another guest and a signed-in user their own copy of a guest extraction", async () => {
    const info = await video();
    const guest = await submit(info, null);
    const original = await finish(guest.source.id);

    for (const requester of [null, userId]) {
      const reused = await submit(info, requester);
      expect(reused.shouldQueue).toBe(false);
      expect(reused.source.status).toBe("READY");
      expect(reused.source.id).not.toBe(guest.source.id);
      expect(reused.source.generatedRecipe).toMatchObject({
        title: "Meatloaf",
        ownerId: requester,
        visibility: "PRIVATE",
      });
    }
    await expect(
      prisma.generatedRecipe.findUniqueOrThrow({ where: { id: original.id } }),
    ).resolves.toMatchObject({ ownerId: null });
  });

  it("never copies a recipe that belongs to an account", async () => {
    const info = await video();
    const owned = await submit(info, userId);
    await finish(owned.source.id);
    await expect(submit(info, otherId)).resolves.toMatchObject({ shouldQueue: true });
    await expect(submit(info, null)).resolves.toMatchObject({ shouldQueue: true });
  });

  it("returns a recipe the user claimed from a guest session", async () => {
    const info = await video();
    const token = domain.createVideoAccessToken();
    const guest = await submit(info, null, token);
    const recipe = await finish(guest.source.id);
    await domain.saveGeneratedRecipeForUser(userId, recipe.id, token);
    const again = await submit(info, userId);
    expect(again).toMatchObject({ shouldQueue: false, source: { id: guest.source.id } });
  });

  it("lets the worker finish a second guest's queued job without extracting again", async () => {
    const info = await video();
    const first = await submit(info, null);
    const second = await submit(info, null);
    expect(second.shouldQueue).toBe(true);
    await finish(first.source.id);
    await domain.markVideoSourceProcessing(second.source.id);
    await expect(
      domain.completeFromGuestExtraction(second.source.id),
    ).resolves.toMatchObject({ status: "READY" });
  });
});

describe("recovering interrupted jobs", () => {
  it("requeues a stale job on resubmission but not an active one", async () => {
    const info = await video();
    const token = domain.createVideoAccessToken();
    const job = await submit(info, userId, token);
    await domain.markVideoSourceProcessing(job.source.id);
    await expect(submit(info, userId, token)).resolves.toMatchObject({ shouldQueue: false });

    await age(job.source.id, domain.PROCESSING_STALE_MS + 1_000);
    const retries = await Promise.all([submit(info, userId, token), submit(info, userId, token)]);
    expect(retries.filter((retry) => retry.shouldQueue)).toHaveLength(1);
  });

  it("lets a redelivered message take over only an abandoned job", async () => {
    const job = await submit(await video(), userId);
    await domain.markVideoSourceProcessing(job.source.id);
    await expect(domain.reclaimVideoSource(job.source.id, 60_000)).resolves.toEqual({ count: 0 });
    await age(job.source.id, 61_000);
    await expect(domain.reclaimVideoSource(job.source.id, 60_000)).resolves.toEqual({ count: 1 });
  });

  it("ends abandoned jobs with a clear message and leaves active ones alone", async () => {
    const stale = await submit(await video(), userId);
    const active = await submit(await video(), userId);
    for (const job of [stale, active]) await domain.markVideoSourceProcessing(job.source.id);
    await age(stale.source.id, domain.PROCESSING_STALE_MS + 1_000);
    await domain.failStaleVideoSources();
    await expect(domain.getVideoSourceForWorker(stale.source.id)).resolves.toMatchObject({
      status: "FAILED",
      errorMessage: domain.INTERRUPTED_MESSAGE,
    });
    await expect(domain.getVideoSourceForWorker(active.source.id)).resolves.toMatchObject({
      status: "PROCESSING",
    });
  });

  it("keeps an existing recipe usable when regeneration fails", async () => {
    const job = await submit(await video(), userId);
    await finish(job.source.id);
    await domain.queueRecipeRegeneration(userId, job.source.id);
    await domain.failVideoSource(job.source.id, "Video download failed.");
    await expect(domain.getVideoSourceForWorker(job.source.id)).resolves.toMatchObject({
      status: "READY",
      errorMessage: "Video download failed.",
    });
  });
});

describe("worker retries", () => {
  it("stops after three attempts", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Recipe extraction service is unavailable."));
    await expect(runExtractionWithRetry(run, () => undefined, 1)).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not repeat Classroom AI failures", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Classroom AI returned an invalid recipe."));
    await expect(runExtractionWithRetry(run, () => undefined, 1)).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("provider metadata", () => {
  const url = (id: string) => `https://edge-api-v3.smvd.xyz/rproxy/${id}?dl=file`;

  it("skips silent and oversized renditions and uses the caption", () => {
    expect(
      getDownloadableVideo({
        metadata: { title: "Short", additionalData: { desc: "Full recipe: 1 lb beef" } },
        contents: [{ videos: [
          { url: url("silent"), metadata: { has_audio: false, content_length: 1 } },
          { url: url("huge"), metadata: { has_audio: true, content_length: 300 * 1024 * 1024 } },
          { url: url("good"), metadata: { has_audio: true, content_length: 1000 } },
        ] }],
      }),
    ).toEqual({ url: url("good"), description: "Full recipe: 1 lb beef" });
  });

  it("reads the author's uniqueId rather than the audio author", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ provider_name: "TikTok" })));
    try {
      await expect(
        fetchSourceCreatorMetadata("https://www.tiktok.com/@x/video/123", {
          contents: [{ audios: [{ name: "Some song" }] }],
          metadata: { author: { user: { uniqueId: "realcook", nickname: "Real Cook" } } },
        }),
      ).resolves.toMatchObject({
        sourceCreatorUsername: "realcook",
        sourceCreatorName: "Real Cook",
        sourceCreatorProfileUrl: "https://www.tiktok.com/@realcook",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

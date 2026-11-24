import { beforeAll, describe, expect, it, vi } from "vitest";

type VideoRecipeDomain = typeof import("@project/domain");
type PrismaClient = import("@project/db").PrismaClient;

let domain: VideoRecipeDomain;
let prisma: PrismaClient;
const ownerId = "video-recipe-owner";
const otherUserId = "video-recipe-other";

beforeAll(async () => {
  process.env.PGLITE_DATA_DIR = "memory://";
  delete process.env.DATABASE_URL;
  domain = await import("@project/domain");
  const db = await import("@project/db");
  prisma = db.prisma;
  await prisma.user.create({ data: { id: ownerId } });
  await prisma.user.create({ data: { id: otherUserId } });
}, 30_000);

describe("video source identities", () => {
  it("normalizes equivalent YouTube links and ignores tracking parameters", async () => {
    const watch = await domain.normalizeVideoUrl(
      "https://www.youtube.com/watch?v=abcdefghijk&utm_source=test",
    );
    const short = await domain.normalizeVideoUrl(
      "https://youtu.be/abcdefghijk?t=42",
    );

    expect(watch.canonicalUrl).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(short.sourceHash).toBe(watch.sourceHash);
    expect(short.videoId).toBe("abcdefghijk");
  });

  it("normalizes platform IDs for TikTok and Instagram", async () => {
    const tiktok = await domain.normalizeVideoUrl(
      "https://www.tiktok.com/@chef/video/123456789?is_from_webapp=1",
    );
    const tiktokCanonical = await domain.normalizeVideoUrl(
      "https://www.tiktok.com/video/123456789",
    );
    const instagram = await domain.normalizeVideoUrl(
      "https://www.instagram.com/reel/AbC123/?igsh=tracking",
    );

    expect(tiktok.sourceHash).toBe(tiktokCanonical.sourceHash);
    expect(tiktok.canonicalUrl).toBe(
      "https://www.tiktok.com/@chef/video/123456789",
    );
    expect(instagram.canonicalUrl).toBe("https://www.instagram.com/p/AbC123/");
  });

  it("resolves TikTok short links only through an allowed HTTPS redirect", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://www.tiktok.com/@cook/video/123456789?tracking=1",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    try {
      const source = await domain.normalizeVideoUrl("https://vm.tiktok.com/short/");
      expect(source.videoId).toBe("123456789");
      expect(fetch).toHaveBeenCalledOnce();

      fetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://www.tiktok.com/@cook/video/987654321?tracking=1",
          },
        }),
      );
      const tiktokComShort = await domain.normalizeVideoUrl(
        "https://www.tiktok.com/t/AbCdEf/",
      );
      expect(tiktokComShort.videoId).toBe("987654321");
      expect(tiktokComShort.canonicalUrl).toBe(
        "https://www.tiktok.com/@cook/video/987654321",
      );
      const canonicalTiktok = await domain.normalizeVideoUrl(
        "https://www.tiktok.com/@cook/video/987654321",
      );
      expect(tiktokComShort.sourceHash).toBe(canonicalTiktok.sourceHash);

      fetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/redirect" },
        }),
      );
      await expect(
        domain.normalizeVideoUrl("https://vt.tiktok.com/short/"),
      ).rejects.toThrow("resolved to an unsupported host");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps uploaded-content hashes in a distinct identity namespace", async () => {
    const first = domain.hashUploadedVideo(new TextEncoder().encode("video one"));
    const repeated = domain.hashUploadedVideo(new TextEncoder().encode("video one"));
    const changed = domain.hashUploadedVideo(new TextEncoder().encode("video two"));
    const link = await domain.normalizeVideoUrl(
      "https://youtu.be/abcdefghijk",
    );

    expect(first).toBe(repeated);
    expect(first).not.toBe(changed);
    expect(first).not.toBe(link.sourceHash);
  });

  it("reuses a source when a concurrent insert reports a Prisma P2002 code", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      "https://youtu.be/qwertyuiop1",
    );
    const input = {
      ...sourceInfo,
      requestedById: ownerId,
      accessToken: domain.createVideoAccessToken(),
    };
    const created = await domain.createOrReuseVideoSource(input);
    const createSpy = vi
      .spyOn(prisma.videoSource, "create")
      .mockRejectedValueOnce(
        Object.assign(new Error("Unique constraint"), { code: "P2002" }),
      );

    try {
      const reused = await domain.createOrReuseVideoSource(input);
      expect(reused.source.id).toBe(created.source.id);
      expect(reused.shouldQueue).toBe(false);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("rejects unsupported hosts and malformed video identifiers", async () => {
    await expect(domain.normalizeVideoUrl("https://example.com/video")).rejects.toThrow();
    await expect(domain.normalizeVideoUrl("https://youtube.com/watch?v=bad")).rejects.toThrow();
    await expect(
      domain.normalizeVideoUrl("https://www.tiktok.com/@chef/video/not-a-number"),
    ).rejects.toThrow();
    await expect(
      domain.normalizeVideoUrl("https://www.tiktok.com/video/123abc"),
    ).rejects.toThrow();
  });
});

describe("persisted video recipes", () => {
  it("uses the job token for a guest cover, saves without duplicating, and preserves cover attribution on regeneration", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      "https://www.tiktok.com/@originalcook/video/7480001234567890123",
    );
    const accessToken = domain.createVideoAccessToken();
    const source = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: null,
      accessToken,
    });
    await domain.updateVideoSourceAttribution(source.source.id, {
      sourcePlatform: "tiktok",
      sourceVideoUrl: sourceInfo.canonicalUrl,
      sourceVideoId: sourceInfo.videoId,
      sourceCreatorUsername: "originalcook",
      sourceCreatorName: "Original Cook",
      sourceCreatorProfileUrl: "https://www.tiktok.com/@originalcook",
    });
    await domain.markVideoSourceProcessing(source.source.id);
    const generated = await domain.completeVideoSource(source.source.id, {
      recipe: {
        title: "Jamaican Meatloaf",
        ingredients: [{ item: "beef", quantity: 1, unit: "lb", estimated: false }],
        instructions: ["Bake until cooked."],
      },
      coverImageKey: `${source.source.id}/cover.jpg`,
    });

    await expect(
      domain.getGeneratedRecipeForUser(generated.id, null),
    ).resolves.toBeNull();
    await expect(
      domain.getGeneratedRecipeForUser(generated.id, null, accessToken),
    ).resolves.toMatchObject({
      coverImageKey: `${source.source.id}/cover.jpg`,
    });

    const saved = await domain.saveGeneratedRecipeForUser(
      ownerId,
      generated.id,
      accessToken,
    );
    const duplicate = await domain.saveGeneratedRecipeForUser(
      ownerId,
      generated.id,
      accessToken,
    );
    expect(duplicate?.id).toBe(saved?.id);

    await expect(
      domain.getSavedRecipeForUser(ownerId, saved!.id),
    ).resolves.toMatchObject({
      generatedRecipe: {
        id: generated.id,
        coverImageKey: `${source.source.id}/cover.jpg`,
        videoSource: {
          sourceCreatorUsername: "originalcook",
          sourceCreatorName: "Original Cook",
          sourceVideoUrl: sourceInfo.canonicalUrl,
        },
      },
    });

    await expect(
      domain.queueRecipeRegeneration(ownerId, source.source.id),
    ).resolves.toMatchObject({ status: "QUEUED" });
    await domain.markVideoSourceProcessing(source.source.id);
    await domain.completeVideoSource(source.source.id, {
      recipe: {
        title: "Jamaican Meatloaf",
        ingredients: [],
        instructions: ["Bake until cooked."],
      },
    });

    await expect(
      domain.getGeneratedRecipeForUser(generated.id, ownerId),
    ).resolves.toMatchObject({
      coverImageKey: `${source.source.id}/cover.jpg`,
      videoSource: {
        sourceCreatorUsername: "originalcook",
        sourceCreatorProfileUrl: "https://www.tiktok.com/@originalcook",
      },
    });
    await expect(
      domain.publishGeneratedRecipe(ownerId, generated.id, true),
    ).resolves.toMatchObject({ visibility: "PUBLIC" });
    const otherUserBookmark = await domain.saveGeneratedRecipeForUser(
      otherUserId,
      generated.id,
    );
    expect(otherUserBookmark?.id).toBeTruthy();
  });

  it("only backfills missing TikTok creator fields and preserves completed attribution", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      "https://www.tiktok.com/@recipechef/video/1234567899876543210",
    );
    const source = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: ownerId,
      accessToken: domain.createVideoAccessToken(),
    });

    await expect(domain.listTikTokSourcesMissingAttribution()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: source.source.id })]),
    );
    await domain.updateVideoSourceAttribution(source.source.id, {
      sourcePlatform: "tiktok",
      sourceVideoUrl: sourceInfo.canonicalUrl,
      sourceVideoId: sourceInfo.videoId,
      sourceCreatorUsername: "recipechef",
      sourceCreatorName: "Recipe Chef",
      sourceCreatorProfileUrl: "https://www.tiktok.com/@recipechef",
    });
    const remaining = await domain.listTikTokSourcesMissingAttribution();
    expect(remaining.some((item) => item.id === source.source.id)).toBe(false);
  });

  it("creates an owner-scoped job instead of returning 404 for another user's private cache entry", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      "https://youtu.be/abcdefghi99",
    );
    const ownerToken = domain.createVideoAccessToken();
    const ownerSource = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: ownerId,
      accessToken: ownerToken,
    });
    await domain.updateVideoSourceAttribution(ownerSource.source.id, {
      sourcePlatform: "youtube",
      sourceVideoUrl: sourceInfo.canonicalUrl,
      sourceVideoId: sourceInfo.videoId,
      sourceCreatorUsername: "cook",
      sourceCreatorName: "Cook",
      sourceCreatorProfileUrl: "https://www.youtube.com/@cook",
    });
    await domain.markVideoSourceProcessing(ownerSource.source.id);
    await domain.completeVideoSource(ownerSource.source.id, {
      recipe: {
        title: "Owner-only video recipe",
        ingredients: [],
        instructions: ["Cook."],
      },
    });

    const otherToken = domain.createVideoAccessToken();
    const otherUserSource = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: otherUserId,
      accessToken: otherToken,
    });
    await domain.updateVideoSourceAttribution(otherUserSource.source.id, {
      sourcePlatform: "youtube",
      sourceVideoUrl: sourceInfo.canonicalUrl,
      sourceVideoId: sourceInfo.videoId,
      sourceCreatorUsername: "cook",
      sourceCreatorName: "Cook",
      sourceCreatorProfileUrl: "https://www.youtube.com/@cook",
    });

    expect(otherUserSource.shouldQueue).toBe(true);
    expect(otherUserSource.source.id).not.toBe(ownerSource.source.id);
    expect(otherUserSource.source.requestedById).toBe(otherUserId);
    expect(otherUserSource.source.sourceHash).not.toBe(sourceInfo.sourceHash);
    await expect(
      domain.getVideoRecipeJob(ownerSource.source.id, otherUserId, otherToken),
    ).resolves.toBeNull();
    await expect(
      domain.getVideoRecipeJob(otherUserSource.source.id, otherUserId, otherToken),
    ).resolves.toMatchObject({ id: otherUserSource.source.id });

    await domain.failVideoSource(otherUserSource.source.id, "Temporary failure.");
    const retried = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: otherUserId,
      accessToken: otherToken,
    });
    const duplicateRetry = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: otherUserId,
      accessToken: otherToken,
    });
    expect(retried.source.id).toBe(otherUserSource.source.id);
    expect(retried.shouldQueue).toBe(true);
    expect(duplicateRetry.source.id).toBe(otherUserSource.source.id);
    expect(duplicateRetry.shouldQueue).toBe(false);

    await domain.markVideoSourceProcessing(otherUserSource.source.id);
    const publicRecipe = await domain.completeVideoSource(
      otherUserSource.source.id,
      {
        recipe: {
          title: "Public video recipe",
          ingredients: [],
          instructions: ["Cook."],
        },
      },
    );
    await domain.publishGeneratedRecipe(otherUserId, publicRecipe.id, true);
    const publicCache = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: null,
      accessToken: domain.createVideoAccessToken(),
    });
    expect(publicCache.shouldQueue).toBe(false);
    expect(publicCache.source.id).toBe(otherUserSource.source.id);
    const unchangedAttribution = await domain.updateVideoSourceAttribution(
      otherUserSource.source.id,
      {
        sourcePlatform: "youtube",
        sourceVideoUrl: sourceInfo.canonicalUrl,
        sourceVideoId: sourceInfo.videoId,
        sourceCreatorUsername: "differentcreator",
        sourceCreatorName: "Different Creator",
        sourceCreatorProfileUrl: "https://www.youtube.com/@differentcreator",
      },
    );
    expect(unchangedAttribution).toMatchObject({
      sourceCreatorUsername: "cook",
      sourceCreatorName: "Cook",
    });
  });

  it("converges concurrent submissions, caches successful recipes, and scopes private access", async () => {
    const source = await domain.normalizeVideoUrl("https://youtu.be/abcdefghijk");
    const accessToken = domain.createVideoAccessToken();
    const input = {
      ...source,
      requestedById: ownerId,
      accessToken,
    };
    const [first, concurrent] = await Promise.all([
      domain.createOrReuseVideoSource(input),
      domain.createOrReuseVideoSource(input),
    ]);
    expect(first.source.id).toBe(concurrent.source.id);
    expect([first.shouldQueue, concurrent.shouldQueue].filter(Boolean)).toHaveLength(1);
    await domain.updateVideoSourceAttribution(first.source.id, {
      sourcePlatform: "youtube",
      sourceVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      sourceVideoId: "abcdefghijk",
      sourceCreatorUsername: "originalchef",
      sourceCreatorName: "Original Chef",
      sourceCreatorProfileUrl: "https://www.youtube.com/@originalchef",
    });
    await expect(
      domain.updateVideoSourceAttribution(first.source.id, {
        sourcePlatform: "youtube",
        sourceVideoUrl: "https://www.youtube.com/watch?v=zyxwvutsrq1",
        sourceVideoId: "zyxwvutsrq1",
        sourceCreatorUsername: "unrelated",
        sourceCreatorName: "Unrelated Creator",
      }),
    ).rejects.toThrow("does not match the stored source");

    await domain.markVideoSourceProcessing(first.source.id);
    const generated = await domain.completeVideoSource(first.source.id, {
      recipe: {
        title: "Test video recipe",
        ingredients: [{ item: "Salmon", quantity: 2, unit: "fillets", estimated: true, said: "some salmon", notes: "Estimated" }],
        instructions: ["Bake until done."],
        tips: ["Check for doneness."],
      },
      transcript: "Use some salmon.",
      ocrCandidates: [{ time: 1, text: "400 F" }],
      model: "summarize",
    });

    const cached = await domain.createOrReuseVideoSource({
      ...input,
      accessToken: domain.createVideoAccessToken(),
    });
    expect(cached.shouldQueue).toBe(false);
    expect(cached.source.generatedRecipe?.id).toBe(generated.id);
    expect(cached.source).toMatchObject({
      sourceCreatorUsername: "originalchef",
      sourceCreatorName: "Original Chef",
      sourceVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    await expect(
      domain.getGeneratedRecipeForUser(generated.id, otherUserId),
    ).resolves.toBeNull();

    const firstBookmark = await domain.saveGeneratedRecipeForUser(ownerId, generated.id);
    const repeatedBookmark = await domain.saveGeneratedRecipeForUser(ownerId, generated.id);
    expect(repeatedBookmark?.id).toBe(firstBookmark?.id);
    await expect(
      domain.getSavedRecipeForUser(ownerId, firstBookmark.id),
    ).resolves.toMatchObject({
      generatedRecipe: {
        videoSource: {
          sourceCreatorUsername: "originalchef",
          sourceCreatorName: "Original Chef",
          sourceVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        },
      },
    });
    await expect(domain.getGeneratedRecipeForUser(generated.id, otherUserId)).resolves.toBeNull();

    const published = await domain.publishGeneratedRecipe(ownerId, generated.id, true);
    expect(published?.visibility).toBe("PUBLIC");
    await expect(
      domain.getGeneratedRecipeForUser(generated.id, otherUserId),
    ).resolves.toMatchObject({
      videoSource: {
        sourceCreatorUsername: "originalchef",
        sourceCreatorName: "Original Chef",
      },
    });
    await expect(
      domain.getGeneratedRecipeForUser(generated.id, otherUserId),
    ).resolves.toMatchObject({ id: generated.id });
    await expect(domain.listPublishedRecipes()).resolves.toMatchObject({
      recipes: expect.arrayContaining([
        expect.objectContaining({ id: generated.id }),
      ]),
    });
  });

  it("does not publish uploaded sources", async () => {
    const sourceHash = domain.hashUploadedVideo(new TextEncoder().encode("upload fixture"));
    const accessToken = domain.createVideoAccessToken();
    const source = await domain.createOrReuseVideoSource({
      sourceType: "UPLOAD",
      platform: null,
      originalUrl: null,
      canonicalUrl: null,
      videoId: null,
      sourceHash,
      requestedById: ownerId,
      accessToken,
    });
    await domain.markVideoSourceProcessing(source.source.id);
    const recipe = await domain.completeVideoSource(source.source.id, {
      recipe: { title: "Private upload", ingredients: [], instructions: [] },
    });

    await expect(
      domain.publishGeneratedRecipe(ownerId, recipe.id, true),
    ).resolves.toBeNull();
  });

  it("allows only the recipe owner to queue one explicit link regeneration", async () => {
    const sourceInfo = await domain.normalizeVideoUrl(
      "https://youtu.be/zyxwvutsrq1",
    );
    const accessToken = domain.createVideoAccessToken();
    const source = await domain.createOrReuseVideoSource({
      ...sourceInfo,
      requestedById: ownerId,
      accessToken,
    });
    await domain.markVideoSourceProcessing(source.source.id);
    const recipe = await domain.completeVideoSource(source.source.id, {
      recipe: {
        title: "Regeneration fixture",
        ingredients: [],
        instructions: ["Cook."],
      },
    });

    await expect(
      domain.queueRecipeRegeneration(otherUserId, source.source.id),
    ).resolves.toBeNull();
    const queued = await domain.queueRecipeRegeneration(ownerId, source.source.id);
    expect(queued).toMatchObject({ id: source.source.id, status: "QUEUED" });
    await expect(
      domain.queueRecipeRegeneration(ownerId, source.source.id),
    ).resolves.toBeNull();

    await domain.markVideoSourceProcessing(source.source.id);
    await domain.completeVideoSource(source.source.id, {
      recipe: {
        title: "Regeneration fixture updated",
        ingredients: [],
        instructions: ["Cook."],
      },
    });
    await expect(
      domain.getGeneratedRecipeForUser(recipe.id, ownerId),
    ).resolves.toMatchObject({ title: "Regeneration fixture updated" });
  });
});

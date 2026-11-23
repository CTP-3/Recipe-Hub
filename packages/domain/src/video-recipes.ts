import { createHash, randomBytes } from "node:crypto";
import { Prisma, prisma } from "@project/db";
import {
  isTikTokHost,
  parseVideoUrl,
  VIDEO_PLATFORM_HOSTS,
  type VideoPlatform,
} from "./video-url";
const MAX_URL_LENGTH = 2_048;

export type NormalizedVideoSource = {
  sourceType: "LINK";
  platform: "youtube" | "tiktok" | "instagram";
  originalUrl: string;
  canonicalUrl: string;
  videoId: string;
  sourceHash: string;
};

function hashSource(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

function userScopedSourceHash(sourceHash: string, userId: string): string {
  return hashSource(`private-link\n${userId}\n${sourceHash}`);
}

function privateLinkSourceHash(input: VideoSourceInput): string {
  return input.requestedById !== null
    ? userScopedSourceHash(input.sourceHash, input.requestedById)
    : hashSource(
        `private-link-access\n${hashVideoAccessToken(input.accessToken)}\n${input.sourceHash}`,
      );
}

function isUniqueConstraintError(
  error: unknown,
): error is { code: "P2002" } {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function findOrCreateVideoSource(
  input: VideoSourceInput,
  sourceHash: string,
) {
  try {
    const source = await prisma.videoSource.create({
      data: {
        sourceType: input.sourceType,
        platform: input.platform,
        originalUrl: input.originalUrl,
        canonicalUrl: input.canonicalUrl,
        videoId: input.videoId,
        ...sourceIdentity(input),
        sourceHash,
        requestedById: input.requestedById,
        accessTokenHash: hashVideoAccessToken(input.accessToken),
      },
      include: { generatedRecipe: true },
    });
    return { source, created: true };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const source = await prisma.videoSource.findUnique({
      where: { sourceHash },
      include: { generatedRecipe: true },
    });
    if (!source) {
      throw new Error("Video source uniqueness conflict could not be resolved.");
    }
    return { source, created: false };
  }
}

async function reuseVideoSource(
  existing: VideoSourceWithRecipe,
  input: VideoSourceInput,
) {
  const userCanRead =
    existing.generatedRecipe?.visibility === "PUBLIC"
      ? true
      : input.requestedById !== null &&
        (existing.requestedById === input.requestedById ||
          existing.generatedRecipe?.ownerId === input.requestedById);
  const tokenCanRead =
    input.requestedById === null &&
    existing.accessTokenHash === hashVideoAccessToken(input.accessToken);

  if (!userCanRead && !tokenCanRead) return null;
  if (existing.status !== "FAILED") {
    return { source: existing, shouldQueue: false };
  }

  const reset = await prisma.videoSource.updateMany({
    where: { id: existing.id, status: "FAILED" },
    data: {
      status: "QUEUED",
      errorMessage: null,
      requestedById: input.requestedById,
      accessTokenHash: hashVideoAccessToken(input.accessToken),
    },
  });
  const source = await prisma.videoSource.findUniqueOrThrow({
    where: { id: existing.id },
    include: { generatedRecipe: true },
  });
  return { source, shouldQueue: reset.count === 1 };
}

async function findPublicVideoRecipe(input: VideoSourceInput) {
  if (
    input.sourceType !== "LINK" ||
    !input.platform ||
    !input.videoId
  ) {
    return null;
  }
  return prisma.videoSource.findFirst({
    where: {
      sourceType: "LINK",
      platform: input.platform,
      videoId: input.videoId,
      status: "READY",
      generatedRecipe: { is: { visibility: "PUBLIC" } },
    },
    include: { generatedRecipe: true },
  });
}

async function resolveTikTokShortUrl(input: URL): Promise<URL> {
  let current = input;
  for (let redirects = 0; redirects < 5; redirects += 1) {
    if (
      !isTikTokHost(current.hostname) ||
      current.protocol !== "https:" ||
      current.username ||
      current.password ||
      current.port
    ) {
      throw new Error("Unsupported short video URL.");
    }
    const parsedCurrent = parseVideoUrl(current.toString());
    if (parsedCurrent && !parsedCurrent.requiresResolution) return current;

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("The short video URL did not resolve to a video.");
    }
    const next = new URL(location, current);
    if (
      next.protocol !== "https:" ||
      !isTikTokHost(next.hostname) ||
      next.username ||
      next.password ||
      next.port
    ) {
      throw new Error("The short video URL resolved to an unsupported host.");
    }
    current = next;
  }
  throw new Error("The short video URL has too many redirects.");
}

export async function normalizeVideoUrl(input: string): Promise<NormalizedVideoSource> {
  if (!input.trim() || input.length > MAX_URL_LENGTH) {
    throw new Error("Provide a supported video URL.");
  }

  let parsed = parseVideoUrl(input);
  if (!parsed) {
    throw new Error("Provide a public YouTube, TikTok, or Instagram video URL.");
  }
  const originalUrl = new URL(input).toString();
  if (parsed.requiresResolution) {
    const resolved = await resolveTikTokShortUrl(new URL(input));
    parsed = parseVideoUrl(resolved.toString());
    if (!parsed || parsed.requiresResolution) {
      throw new Error("The TikTok short link did not resolve to a video.");
    }
  }

  const { platform, videoId, canonicalUrl } = parsed;
  if (!videoId || !canonicalUrl) {
    throw new Error("The video URL could not be normalized.");
  }

  return {
    sourceType: "LINK",
    platform,
    originalUrl,
    canonicalUrl,
    videoId,
    sourceHash: hashSource(`link\n${platform}\n${videoId}`),
  };
}

export function hashUploadedVideo(data: Uint8Array): string {
  return hashSource(`upload\n${createHash("sha256").update(data).digest("hex")}`);
}

export function createVideoAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashVideoAccessToken(token: string): string {
  return hashSource(`access\n${token}`);
}

type VideoSourceInput = {
  sourceType: "LINK" | "UPLOAD";
  platform?: string | null;
  originalUrl?: string | null;
  canonicalUrl?: string | null;
  videoId?: string | null;
  sourcePlatform?: string | null;
  sourceVideoUrl?: string | null;
  sourceVideoId?: string | null;
  sourceHash: string;
  requestedById: string | null;
  accessToken: string;
};

export type VideoSourceAttribution = {
  sourcePlatform: string;
  sourceVideoUrl: string;
  sourceVideoId: string;
  sourceCreatorUsername?: string | null;
  sourceCreatorName?: string | null;
  sourceCreatorProfileUrl?: string | null;
};

type VideoSourceWithRecipe = Prisma.VideoSourceGetPayload<{
  include: { generatedRecipe: true };
}>;

function sourceIdentity(input: VideoSourceInput) {
  return {
    sourcePlatform: input.sourcePlatform ?? input.platform ?? null,
    sourceVideoUrl: input.sourceVideoUrl ?? input.canonicalUrl ?? input.originalUrl ?? null,
    sourceVideoId: input.sourceVideoId ?? input.videoId ?? null,
  };
}

function validCreatorProfileUrl(
  value: string | null | undefined,
  platform: VideoPlatform,
): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !(VIDEO_PLATFORM_HOSTS[platform] as readonly string[]).includes(url.hostname)
    ) {
      return null;
    }
    const validPath =
      platform === "tiktok"
        ? /^\/@[A-Za-z0-9._-]+\/?$/.test(url.pathname)
        : platform === "instagram"
          ? /^\/[A-Za-z0-9._]+\/?$/.test(url.pathname)
          : /^\/(?:@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)\/?$/.test(
              url.pathname,
            );
    return validPath ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function updateVideoSourceAttribution(
  sourceId: string,
  attribution: VideoSourceAttribution,
) {
  const parsed = parseVideoUrl(attribution.sourceVideoUrl);
  if (
    !parsed ||
    parsed.requiresResolution ||
    parsed.platform !== attribution.sourcePlatform ||
    parsed.videoId !== attribution.sourceVideoId
  ) {
    throw new Error("Video source attribution does not match the canonical video.");
  }
  const username = attribution.sourceCreatorUsername?.trim().replace(/^@/, "") ?? null;
  if (
    username !== null &&
    (!/^[A-Za-z0-9._-]{1,100}$/.test(username) ||
      attribution.sourcePlatform === "instagram" && !/^[A-Za-z0-9._]{1,100}$/.test(username))
  ) {
    throw new Error("Video source creator username is invalid.");
  }
  const creatorName = attribution.sourceCreatorName?.trim().slice(0, 200) || null;
  const profileUrl = validCreatorProfileUrl(
    attribution.sourceCreatorProfileUrl,
    parsed.platform,
  );

  return prisma.$transaction(async (transaction) => {
    const source = await transaction.videoSource.findUnique({
      where: { id: sourceId },
    });
    if (!source || source.sourceType !== "LINK") return null;
    const storedUrl =
      source.sourceVideoUrl ?? source.canonicalUrl ?? source.originalUrl;
    const storedVideo = storedUrl ? parseVideoUrl(storedUrl) : null;
    if (
      (source.platform !== null && source.platform !== parsed.platform) ||
      (source.videoId !== null && source.videoId !== parsed.videoId) ||
      (source.sourcePlatform !== null &&
        source.sourcePlatform !== parsed.platform) ||
      (source.sourceVideoId !== null &&
        source.sourceVideoId !== parsed.videoId) ||
      (storedVideo &&
        !storedVideo.requiresResolution &&
        (storedVideo.platform !== parsed.platform ||
          storedVideo.videoId !== parsed.videoId))
    ) {
      throw new Error("Video source attribution does not match the stored source.");
    }

    await transaction.videoSource.updateMany({
      where: { id: sourceId, sourcePlatform: null },
      data: { sourcePlatform: parsed.platform },
    });
    await transaction.videoSource.updateMany({
      where: { id: sourceId, sourceVideoUrl: null },
      data: { sourceVideoUrl: parsed.canonicalUrl },
    });
    await transaction.videoSource.updateMany({
      where: { id: sourceId, sourceVideoId: null },
      data: { sourceVideoId: parsed.videoId },
    });
    if (username) {
      await transaction.videoSource.updateMany({
        where: { id: sourceId, sourceCreatorUsername: null },
        data: { sourceCreatorUsername: username },
      });
    }
    if (creatorName) {
      await transaction.videoSource.updateMany({
        where: { id: sourceId, sourceCreatorName: null },
        data: { sourceCreatorName: creatorName },
      });
    }
    if (profileUrl) {
      await transaction.videoSource.updateMany({
        where: { id: sourceId, sourceCreatorProfileUrl: null },
        data: { sourceCreatorProfileUrl: profileUrl },
      });
    }
    return transaction.videoSource.findUniqueOrThrow({
      where: { id: sourceId },
      include: { generatedRecipe: true },
    });
  });
}

export async function listTikTokSourcesMissingAttribution(
  afterId?: string,
  limit = 50,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Attribution backfill limit must be between 1 and 100.");
  }
  return prisma.videoSource.findMany({
    where: {
      sourceType: "LINK",
      platform: "tiktok",
      OR: [
        { sourceCreatorUsername: null },
        { sourceCreatorName: null },
        { sourceCreatorProfileUrl: null },
      ],
      ...(afterId ? { id: { gt: afterId } } : {}),
    },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true,
      canonicalUrl: true,
      originalUrl: true,
      sourceVideoUrl: true,
    },
  });
}

export async function createOrReuseVideoSource(input: VideoSourceInput) {
  const existing = await prisma.videoSource.findUnique({
    where: { sourceHash: input.sourceHash },
    include: { generatedRecipe: true },
  });
  if (existing) {
    const reusable = await reuseVideoSource(existing, input);
    if (reusable) return reusable;

    const publicSource = await findPublicVideoRecipe(input);
    if (publicSource) return { source: publicSource, shouldQueue: false };
    if (input.sourceType !== "LINK") {
      throw new Error("Video recipe not found.");
    }

    const scopedHash = privateLinkSourceHash(input);
    const scoped = await findOrCreateVideoSource(input, scopedHash);
    if (scoped.created) return { source: scoped.source, shouldQueue: true };
    const scopedReusable = await reuseVideoSource(scoped.source, input);
    if (scopedReusable) return scopedReusable;
    throw new Error("Video recipe not found.");
  }

  if (input.sourceType === "LINK") {
    const publicSource = await findPublicVideoRecipe(input);
    if (publicSource) return { source: publicSource, shouldQueue: false };
    const scopedHash = privateLinkSourceHash(input);
    const scoped = await prisma.videoSource.findUnique({
      where: { sourceHash: scopedHash },
      include: { generatedRecipe: true },
    });
    if (scoped) {
      const reusable = await reuseVideoSource(scoped, input);
      if (reusable) return reusable;
      throw new Error("Video recipe not found.");
    }
  }

  const result = await findOrCreateVideoSource(input, input.sourceHash);
  if (result.created) return { source: result.source, shouldQueue: true };
  const reusable = await reuseVideoSource(result.source, input);
  if (reusable) return reusable;

  const publicSource = await findPublicVideoRecipe(input);
  if (publicSource) return { source: publicSource, shouldQueue: false };
  if (input.sourceType !== "LINK") {
    throw new Error("Video recipe not found.");
  }

  const scopedHash = privateLinkSourceHash(input);
  const scoped = await findOrCreateVideoSource(input, scopedHash);
  if (scoped.created) return { source: scoped.source, shouldQueue: true };
  const scopedReusable = await reuseVideoSource(scoped.source, input);
  if (scopedReusable) return scopedReusable;
  throw new Error("Video recipe not found.");
}

export async function setVideoUploadBlob(sourceId: string, uploadBlobKey: string) {
  return prisma.videoSource.update({
    where: { id: sourceId, status: "QUEUED" },
    data: { uploadBlobKey },
  });
}

export async function markVideoSourceProcessing(sourceId: string) {
  return prisma.videoSource.updateMany({
    where: { id: sourceId, status: "QUEUED" },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
}

export type GeneratedRecipeExtraction = {
  recipe: unknown;
  transcript?: string;
  ocrCandidates?: unknown;
  model?: string;
  coverImageKey?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function completeVideoSource(
  sourceId: string,
  result: GeneratedRecipeExtraction,
) {
  const recipe = result.recipe;
  if (!isRecord(recipe)) {
    throw new Error("Extraction returned an invalid recipe.");
  }
  const title = recipe.title;
  if (typeof title !== "string") {
    throw new Error("Extraction returned an invalid recipe.");
  }

  return prisma.$transaction(async (transaction) => {
    const source = await transaction.videoSource.findUniqueOrThrow({
      where: { id: sourceId },
    });
    const generatedRecipe = await transaction.generatedRecipe.upsert({
      where: { videoSourceId: sourceId },
      create: {
        videoSourceId: sourceId,
        ownerId: source.requestedById,
        title,
        recipe: recipe as Prisma.InputJsonValue,
        transcript: result.transcript ?? null,
        ocrCandidates: result.ocrCandidates as Prisma.InputJsonValue | undefined,
        model: result.model ?? null,
        coverImageKey: result.coverImageKey ?? null,
        updatedAt: new Date(),
      },
      update: {
        title,
        recipe: recipe as Prisma.InputJsonValue,
        transcript: result.transcript ?? null,
        ocrCandidates: result.ocrCandidates as Prisma.InputJsonValue | undefined,
        model: result.model ?? null,
        ...(result.coverImageKey
          ? { coverImageKey: result.coverImageKey }
          : {}),
        updatedAt: new Date(),
      },
    });
    await transaction.videoSource.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        errorMessage: null,
        lastProcessedAt: new Date(),
        uploadBlobKey: null,
      },
    });
    return generatedRecipe;
  });
}

export async function failVideoSource(sourceId: string, message: string) {
  return prisma.videoSource.updateMany({
    where: { id: sourceId, status: { not: "READY" } },
    data: { status: "FAILED", errorMessage: message.slice(0, 2_000) },
  });
}

export async function queueRecipeRegeneration(userId: string, sourceId: string) {
  const source = await prisma.videoSource.findFirst({
    where: {
      id: sourceId,
      sourceType: "LINK",
      status: "READY",
      generatedRecipe: { ownerId: userId },
    },
  });
  if (!source) return null;
  const updated = await prisma.videoSource.updateMany({
    where: {
      id: sourceId,
      sourceType: "LINK",
      status: "READY",
      generatedRecipe: { is: { ownerId: userId } },
    },
    data: { status: "QUEUED", errorMessage: null },
  });
  return updated.count === 1
    ? prisma.videoSource.findUnique({ where: { id: sourceId } })
    : null;
}

export async function getVideoSourceForWorker(sourceId: string) {
  return prisma.videoSource.findUnique({ where: { id: sourceId } });
}

export async function getVideoRecipeJob(
  sourceId: string,
  userId: string | null,
  accessToken: string | null,
) {
  const source = await prisma.videoSource.findUnique({
    where: { id: sourceId },
    include: { generatedRecipe: true },
  });
  if (!source) return null;

  const canRead =
    source.generatedRecipe?.visibility === "PUBLIC" ||
    (userId !== null &&
      (source.requestedById === userId ||
        source.generatedRecipe?.ownerId === userId)) ||
    (accessToken !== null &&
      source.accessTokenHash === hashVideoAccessToken(accessToken));
  return canRead ? source : null;
}

export async function getGeneratedRecipeForUser(
  id: string,
  userId: string | null,
  accessToken: string | null = null,
) {
  const accessTokenHash = accessToken
    ? hashVideoAccessToken(accessToken)
    : null;
  return prisma.generatedRecipe.findFirst({
    where: {
      id,
      OR: [
        { visibility: "PUBLIC" },
        ...(userId
          ? [{ ownerId: userId }, { bookmarks: { some: { userId } } }]
          : []),
        ...(accessTokenHash
          ? [{ videoSource: { accessTokenHash } }]
          : []),
      ],
    },
    include: {
      videoSource: true,
      owner: { select: { name: true, username: true } },
    },
  });
}

export async function saveGeneratedRecipeForUser(
  userId: string,
  generatedRecipeId: string,
  accessToken?: string,
) {
  return prisma.$transaction(async (transaction) => {
    let recipe = await transaction.generatedRecipe.findFirst({
      where: { id: generatedRecipeId, videoSource: { status: "READY" } },
      include: { videoSource: true },
    });
    if (!recipe) return null;

    if (!recipe.ownerId && recipe.visibility === "PRIVATE") {
      if (
        recipe.videoSource.requestedById !== userId &&
        (!accessToken ||
          recipe.videoSource.accessTokenHash !== hashVideoAccessToken(accessToken))
      ) {
        return null;
      }
      await transaction.generatedRecipe.updateMany({
        where: { id: recipe.id, ownerId: null },
        data: { ownerId: userId },
      });
      recipe = await transaction.generatedRecipe.findUniqueOrThrow({
        where: { id: recipe.id },
        include: { videoSource: true },
      });
    }
    if (recipe.visibility === "PRIVATE" && recipe.ownerId !== userId) return null;

    const fingerprint = hashSource(`generated-recipe\n${recipe.id}\n${userId}`);
    return transaction.savedRecipe.upsert({
      where: {
        userId_generatedRecipeId: { userId, generatedRecipeId: recipe.id },
      },
      create: {
        userId,
        fingerprint,
        title: recipe.title,
        sourceVideo: recipe.videoSource.originalUrl,
        generatedRecipeId: recipe.id,
      },
      update: {},
      select: { id: true, title: true, createdAt: true },
    });
  });
}

export async function listCreatedRecipesForUser(userId: string) {
  return prisma.generatedRecipe.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    include: { videoSource: true },
  });
}

export async function publishGeneratedRecipe(userId: string, id: string, publish: boolean) {
  const recipe = await prisma.generatedRecipe.findFirst({
    where: { id, ownerId: userId, videoSource: { sourceType: "LINK", status: "READY" } },
  });
  if (!recipe) return null;
  return prisma.generatedRecipe.update({
    where: { id },
    data: { visibility: publish ? "PUBLIC" : "PRIVATE" },
  });
}

export async function listPublishedRecipes(cursor?: string, limit = 12) {
  const recipes = await prisma.generatedRecipe.findMany({
    where: {
      visibility: "PUBLIC",
      videoSource: { sourceType: "LINK", status: "READY" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { videoSource: true },
  });
  const hasMore = recipes.length > limit;
  const page = hasMore ? recipes.slice(0, limit) : recipes;
  return { recipes: page, nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
}

export async function bookmarkDemoRecipe(
  userId: string,
  recipe: {
    id: string;
    title: string;
    description?: string;
    image: string;
    category?: string;
    time?: string;
    servings?: number;
    ingredients: string[];
    instructions: string[];
  },
) {
  const fingerprint = hashSource(`demo\n${recipe.id}`);
  return prisma.savedRecipe.upsert({
    where: { userId_fingerprint: { userId, fingerprint } },
    create: {
      userId,
      fingerprint,
      title: recipe.title,
      recipe: recipe as unknown as Prisma.InputJsonValue,
    },
    update: {},
    select: { id: true, title: true, createdAt: true },
  });
}

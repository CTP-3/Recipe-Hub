import {
  normalizeVideoUrl,
  parseVideoUrl,
  VIDEO_PLATFORM_HOSTS,
  type VideoSourceAttribution,
} from "@project/domain";

const RAPIDAPI_HOST = "social-media-video-downloader.p.rapidapi.com";
// Same limits as the extraction service.
const MAX_LINK_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 10_000;
const RAPIDAPI_BASE_URL = `https://${RAPIDAPI_HOST}`;

export function getDownloadableVideo(result: unknown): {
  url: string;
  description: string;
} | null {
  if (!result || typeof result !== "object" || !("contents" in result) || !Array.isArray(result.contents)) {
    return null;
  }
  const candidates: Array<{ url: string; description: string; bytes: number }> = [];
  for (const content of result.contents) {
    if (!isRecord(content) || !Array.isArray(content.videos)) continue;
    for (const video of content.videos) {
      if (!isRecord(video) || typeof video.url !== "string") continue;
      const metadata = isRecord(video.metadata) ? video.metadata : {};
      // Speech is the main evidence, so a silent rendition is not usable.
      if (metadata.has_audio === false) continue;
      try {
        const url = new URL(video.url);
        if (
          url.protocol === "https:" &&
          url.hostname === "edge-api-v3.smvd.xyz" &&
          url.pathname.startsWith("/rproxy/") &&
          !url.username &&
          !url.password
        ) {
          candidates.push({
            url: url.toString(),
            description:
              videoCaption(result) ?? url.searchParams.get("dl") ?? "",
            bytes:
              typeof metadata.content_length === "number"
                ? metadata.content_length
                : 0,
          });
        }
      } catch {
        continue;
      }
    }
  }
  const chosen =
    candidates.find((candidate) => candidate.bytes <= MAX_LINK_VIDEO_BYTES) ??
    candidates[0];
  return chosen ? { url: chosen.url, description: chosen.description } : null;
}

// Creators often write the full recipe in the caption.
function videoCaption(result: object): string | null {
  if (!("metadata" in result) || !isRecord(result.metadata)) return null;
  const extra = result.metadata.additionalData;
  const captions = [
    ...(isRecord(extra) ? [extra.desc, extra.description] : []),
    result.metadata.description,
    result.metadata.title,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const caption = captions.sort((a, b) => b.length - a.length)[0];
  return caption ? caption.trim().slice(0, MAX_CAPTION_LENGTH) : null;
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function upstreamUrl(
  videoUrl: URL,
  platform: "youtube" | "tiktok" | "instagram",
  videoId: string,
): URL {
  const endpoint = new URL(RAPIDAPI_BASE_URL);
  if (platform === "youtube") {
    endpoint.pathname = "/youtube/v3/video/details";
    endpoint.searchParams.set("videoId", videoId);
    return endpoint;
  }
  if (platform === "tiktok") {
    endpoint.pathname = "/tiktok/v3/post/details";
    endpoint.searchParams.set("url", videoUrl.toString());
    return endpoint;
  }
  endpoint.pathname = "/instagram/v3/media/post/details";
  endpoint.searchParams.set("renderableFormats", "720p,highres");
  endpoint.searchParams.set("shortcode", videoId);
  return endpoint;
}

export async function inspectVideoUrl(input: string): Promise<Response> {
  const parsed = parseVideoUrl(input);
  if (!parsed || parsed.requiresResolution || !parsed.videoId) {
    return errorResponse(
      "INVALID_URL",
      "Provide a supported YouTube, TikTok, or Instagram video URL.",
      400,
    );
  }
  const platform = parsed.platform;
  const videoUrl = new URL(input);
  const endpoint = upstreamUrl(videoUrl, platform, parsed.videoId);
  const apiKey = process.env.SMVD_RAPIDAPI_KEY;
  if (!apiKey) {
    return errorResponse("CONFIGURATION_ERROR", "The video service is not configured.", 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return errorResponse("UPSTREAM_ERROR", "Video service is unavailable.", 502);
  }
  if (upstream.status === 429) {
    return errorResponse("RATE_LIMITED", "Video service rate limit reached. Try later.", 429);
  }
  if ([400, 404, 422].includes(upstream.status)) {
    return errorResponse("VIDEO_UNAVAILABLE", "The video could not be found or processed.", 400);
  }
  if (!upstream.ok) {
    return errorResponse("UPSTREAM_ERROR", "Video service request failed.", 502);
  }
  let result: unknown;
  try {
    result = await upstream.json();
  } catch {
    return errorResponse(
      "INVALID_UPSTREAM_RESPONSE",
      "Video service returned an invalid response.",
      502,
    );
  }
  return Response.json({ platform, result });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function creatorProfileUrl(
  value: string | null,
  platform: "youtube" | "tiktok" | "instagram",
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

function creatorFromProvider(
  input: unknown,
  platform: "youtube" | "tiktok" | "instagram",
): {
  username: string | null;
  name: string | null;
  profileUrl: string | null;
} {
  const pending: Array<{ value: unknown; depth: number }> = Array.isArray(input)
    ? input.slice(0, 20).map((value) => ({ value, depth: 0 }))
    : [{ value: input, depth: 0 }];
  let username: string | null = null;
  let name: string | null = null;
  let profileUrl: string | null = null;
  let visited = 0;

  // The provider's explicit author beats any name found elsewhere in the
  // response, such as the audio track's.
  for (const value of Array.isArray(input) ? input : [input]) {
    const metadata = isRecord(value) ? value.metadata : null;
    const author = isRecord(metadata) ? metadata.author : null;
    const user = isRecord(author) ? author.user : null;
    if (!isRecord(user)) continue;
    username ??= firstString(user, ["uniqueId", "unique_id", "username"]);
    name ??= firstString(user, ["nickname", "full_name"]);
  }

  while (pending.length && visited < 100) {
    const item = pending.shift();
    if (!item || !isRecord(item.value)) continue;
    visited += 1;
    const record = item.value;
    username ??= firstString(record, [
      "author_unique_id",
      "unique_id",
      "username",
      "user_name",
      "authorUsername",
      "handle",
    ]);
    name ??= firstString(record, [
      "author_name",
      "display_name",
      "nickname",
      "full_name",
      "name",
    ]);
    const candidateProfileUrl = creatorProfileUrl(
      firstString(record, ["author_url", "profile_url", "user_url"]),
      platform,
    );
    profileUrl ??= candidateProfileUrl;
    if (!username && candidateProfileUrl) {
      try {
        const path = new URL(candidateProfileUrl).pathname;
        const handleMatch =
          platform === "tiktok"
            ? path.match(/^\/@([A-Za-z0-9._-]+)\/?$/)
            : platform === "instagram"
              ? path.match(/^\/([A-Za-z0-9._]+)\/?$/)
              : path.match(/^\/@([A-Za-z0-9._-]+)\/?$/);
        username = handleMatch?.[1] ?? null;
      } catch {
        // The URL was validated above; retain metadata without a handle if parsing fails.
      }
    }
    if (item.depth < 5) {
      for (const value of Object.values(record)) {
        if (isRecord(value)) pending.push({ value, depth: item.depth + 1 });
        else if (Array.isArray(value)) {
          for (const child of value.slice(0, 20)) {
            if (isRecord(child)) pending.push({ value: child, depth: item.depth + 1 });
          }
        }
      }
    }
  }

  username = username?.trim().replace(/^@/, "") ?? null;
  if (
    username &&
    !/^[A-Za-z0-9._-]{1,100}$/.test(username)
  ) {
    username = null;
  }
  if (
    username &&
    (platform === "tiktok" || platform === "instagram") &&
    !/^[A-Za-z0-9._-]{1,100}$/.test(username)
  ) {
    username = null;
  }
  if (!profileUrl && username) {
    profileUrl =
      platform === "tiktok"
        ? `https://www.tiktok.com/@${encodeURIComponent(username)}`
        : platform === "instagram"
          ? `https://www.instagram.com/${encodeURIComponent(username)}/`
          : null;
  }
  return {
    username,
    name: name?.trim().slice(0, 200) || null,
    profileUrl,
  };
}

async function fetchOembedMetadata(
  platform: "youtube" | "tiktok",
  canonicalUrl: string,
): Promise<unknown> {
  const endpoint = new URL(
    platform === "tiktok"
      ? "https://www.tiktok.com/oembed"
      : "https://www.youtube.com/oembed",
  );
  endpoint.searchParams.set("url", canonicalUrl);
  if (platform === "youtube") endpoint.searchParams.set("format", "json");
  const response = await fetch(endpoint, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`${platform} oEmbed returned HTTP ${response.status}.`);
  }
  return response.json();
}

export async function fetchSourceCreatorMetadata(
  inputUrl: string,
  providerResult?: unknown,
): Promise<VideoSourceAttribution> {
  const normalized = await normalizeVideoUrl(inputUrl);
  let metadata: unknown = providerResult;
  if (normalized.platform === "tiktok" || normalized.platform === "youtube") {
    try {
      const oembed = await fetchOembedMetadata(
        normalized.platform,
        normalized.canonicalUrl,
      );
      metadata = providerResult === undefined ? oembed : [oembed, providerResult];
    } catch (error) {
      console.warn(
        `Unable to retrieve ${normalized.platform} oEmbed metadata:`,
        error instanceof Error ? error.message : "unknown error",
      );
    }
  } else if (metadata === undefined) {
    try {
      const response = await inspectVideoUrl(normalized.canonicalUrl);
      if (response.ok) {
        const inspection: unknown = await response.json();
        if (isRecord(inspection)) metadata = inspection.result;
      } else {
        console.warn(
          "Unable to retrieve Instagram creator metadata:",
          response.status,
        );
      }
    } catch (error) {
      console.warn(
        "Unable to retrieve Instagram creator metadata:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }

  const creator = creatorFromProvider(metadata, normalized.platform);
  return {
    sourcePlatform: normalized.platform,
    sourceVideoUrl: normalized.canonicalUrl,
    sourceVideoId: normalized.videoId,
    sourceCreatorUsername: creator.username,
    sourceCreatorName: creator.name,
    sourceCreatorProfileUrl: creator.profileUrl,
  };
}

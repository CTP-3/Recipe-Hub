import { parseVideoUrl, VIDEO_PLATFORM_HOSTS } from "@project/domain/video-url";

type VideoPlatform = "tiktok" | "youtube" | "instagram";

type OriginalVideoAttributionProps = {
  platform: string | null;
  videoUrl: string | null;
  creatorUsername: string | null;
  creatorName: string | null;
  creatorProfileUrl: string | null;
  recipeHubContributor?: string | null;
  compact?: boolean;
};

const PLATFORM_NAMES: Record<VideoPlatform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

function isSupportedPlatform(value: string | null): value is VideoPlatform {
  return value === "tiktok" || value === "youtube" || value === "instagram";
}

function isSafeSourceUrl(value: string | null, platform: VideoPlatform): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const parsed = parseVideoUrl(value);
    return (
      parsed !== null &&
      !parsed.requiresResolution &&
      parsed.platform === platform &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (VIDEO_PLATFORM_HOSTS[platform] as readonly string[]).includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function safeProfileUrl(
  value: string | null,
  platform: VideoPlatform,
): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
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
  return validPath && !url.search && !url.hash ? url.toString() : null;
}

export default function OriginalVideoAttribution({
  platform,
  videoUrl,
  creatorUsername,
  creatorName,
  creatorProfileUrl,
  recipeHubContributor,
  compact = false,
}: OriginalVideoAttributionProps) {
  if (!isSupportedPlatform(platform)) return null;
  const sourceLink = isSafeSourceUrl(videoUrl, platform) ? videoUrl : null;
  const profileLink = safeProfileUrl(creatorProfileUrl, platform);
  const creatorLabel = creatorUsername
    ? `@${creatorUsername.replace(/^@/, "")}`
    : creatorName || "Original creator unavailable";
  const platformName = PLATFORM_NAMES[platform];

  if (compact) {
    return (
      <div className="border-t border-stone-200 px-4 pb-4 pt-3 text-xs text-stone-600">
        <p>
          Original recipe video by{" "}
          {profileLink ? (
            <a
              href={profileLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-stone-800 underline underline-offset-2"
              onClick={(event) => event.stopPropagation()}
            >
              {creatorLabel}
            </a>
          ) : (
            <strong className="font-semibold text-stone-800">{creatorLabel}</strong>
          )}
        </p>
        {sourceLink && (
          <a
            href={sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-semibold text-emerald-800 underline underline-offset-2"
            onClick={(event) => event.stopPropagation()}
          >
            {platformName} · Watch Original Video
          </a>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="original-video-heading"
      className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5"
    >
      <h2
        id="original-video-heading"
        className="text-xl font-bold text-[#294d38]"
      >
        Original Video
      </h2>
      <p className="mt-2 text-sm text-stone-700">
        Created by{" "}
        {profileLink ? (
          <a
            href={profileLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-800 underline underline-offset-2"
          >
            {creatorLabel}
          </a>
        ) : (
          <strong>{creatorLabel}</strong>
        )}{" "}
        on {platformName}
      </p>
      <p className="mt-1 text-xs text-stone-600">
        Recipe Hub recipe by{" "}
        <strong>{recipeHubContributor || "a Recipe Hub member"}</strong>; this
        account is separate from the original video creator.
      </p>
      {sourceLink && (
        <a
          href={sourceLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block font-semibold text-emerald-800 underline underline-offset-2"
        >
          Watch on {platformName}
        </a>
      )}
      <p className="mt-3 text-xs text-stone-500">
        AI-generated recipe based on an external video. Original content belongs
        to its respective creator.
      </p>
    </section>
  );
}

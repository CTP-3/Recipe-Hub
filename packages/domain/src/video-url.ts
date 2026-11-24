export const VIDEO_PLATFORM_HOSTS = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  tiktok: [
    "tiktok.com",
    "www.tiktok.com",
    "m.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
  ],
  instagram: ["instagram.com", "www.instagram.com", "m.instagram.com"],
} as const;

export type VideoPlatform = keyof typeof VIDEO_PLATFORM_HOSTS;

export type ParsedVideoUrl = {
  platform: VideoPlatform;
  videoId: string | null;
  canonicalUrl: string | null;
  requiresResolution: boolean;
};

function supportedUrl(input: string): URL | null {
  if (!input.trim() || input.length > 2_048) return null;
  try {
    const url = new URL(input);
    url.hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function hostPlatform(hostname: string): VideoPlatform | null {
  for (const [platform, hosts] of Object.entries(VIDEO_PLATFORM_HOSTS)) {
    if ((hosts as readonly string[]).includes(hostname)) {
      return platform as VideoPlatform;
    }
  }
  return null;
}

export function isTikTokHost(hostname: string): boolean {
  return (VIDEO_PLATFORM_HOSTS.tiktok as readonly string[]).includes(hostname);
}

export function parseVideoUrl(input: string): ParsedVideoUrl | null {
  const url = supportedUrl(input);
  if (!url) return null;
  const platform = hostPlatform(url.hostname);
  if (!platform) return null;

  if (platform === "youtube") {
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
        : url.pathname === "/watch"
          ? url.searchParams.get("v") ?? undefined
          : url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return {
      platform,
      videoId: id,
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      requiresResolution: false,
    };
  }

  if (platform === "tiktok") {
    if (
      ((url.hostname === "vm.tiktok.com" ||
        url.hostname === "vt.tiktok.com") &&
        /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) ||
      /^\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    ) {
      return {
        platform,
        videoId: null,
        canonicalUrl: null,
        requiresResolution: true,
      };
    }

    const match = url.pathname.match(
      /^(?:\/@([A-Za-z0-9._-]+))?\/video\/(\d+)\/?$/,
    );
    if (!match) return null;
    const [, username, id] = match;
    return {
      platform,
      videoId: id,
      canonicalUrl: username
        ? `https://www.tiktok.com/@${username}/video/${id}`
        : `https://www.tiktok.com/video/${id}`,
      requiresResolution: false,
    };
  }

  const match = url.pathname.match(
    /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/,
  );
  if (!match) return null;
  return {
    platform,
    videoId: match[1],
    canonicalUrl: `https://www.instagram.com/p/${match[1]}/`,
    requiresResolution: false,
  };
}

export function isSupportedVideoUrl(input: string): boolean {
  return parseVideoUrl(input) !== null;
}

import { inspectVideoUrl } from "../../../../lib/inspect-video";
import { normalizeVideoUrl } from "@project/domain";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be JSON.", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("url" in body) ||
    typeof body.url !== "string" ||
    body.url.length > 2_048
  ) {
    return errorResponse("INVALID_URL", "Provide a video URL.", 400);
  }
  try {
    const normalized = await normalizeVideoUrl(body.url);
    return inspectVideoUrl(normalized.canonicalUrl);
  } catch (error) {
    return errorResponse(
      "INVALID_URL",
      error instanceof Error
        ? error.message
        : "Provide a supported YouTube, TikTok, or Instagram video URL.",
      400,
    );
  }
}

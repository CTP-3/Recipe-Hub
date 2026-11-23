import { currentUserId } from "@project/auth";
import {
  createOrReuseVideoSource,
  createVideoAccessToken,
  failVideoSource,
  hashUploadedVideo,
  normalizeVideoUrl,
  setVideoUploadBlob,
  updateVideoSourceAttribution,
} from "@project/domain";
import {
  enqueue,
  uploadAttachment,
} from "@project/services";
import {
  getDownloadableVideo,
  fetchSourceCreatorMetadata,
  inspectVideoUrl,
} from "../../../../lib/inspect-video";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function priorAccessToken(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(value)
    ? value
    : createVideoAccessToken();
}

function sourceResponse(
  source: {
    id: string;
    status: string;
    sourcePlatform: string | null;
    sourceVideoUrl: string | null;
    sourceVideoId: string | null;
    sourceCreatorUsername: string | null;
    sourceCreatorName: string | null;
    sourceCreatorProfileUrl: string | null;
    generatedRecipe?: {
      id: string;
      title: string;
      recipe: unknown;
      transcript: string | null;
      ocrCandidates: unknown;
      model: string | null;
      coverImageKey: string | null;
      visibility: string;
    } | null;
  },
  accessToken: string,
  queued: boolean,
  userId: string | null,
) {
  const privateCoverNeedsToken =
    userId === null &&
    source.generatedRecipe?.visibility.toLowerCase() === "private";
  return Response.json(
    {
      sourceId: source.id,
      status: source.status.toLowerCase(),
      queued,
      accessToken,
      sourcePlatform: source.sourcePlatform,
      sourceVideoUrl: source.sourceVideoUrl,
      sourceVideoId: source.sourceVideoId,
      sourceCreatorUsername: source.sourceCreatorUsername,
      sourceCreatorName: source.sourceCreatorName,
      sourceCreatorProfileUrl: source.sourceCreatorProfileUrl,
      recipe: source.generatedRecipe
        ? {
            id: source.generatedRecipe.id,
            title: source.generatedRecipe.title,
            recipe: source.generatedRecipe.recipe,
            transcript: source.generatedRecipe.transcript ?? "",
            ocrCandidates: source.generatedRecipe.ocrCandidates ?? [],
            model: source.generatedRecipe.model ?? "",
            coverImageUrl: source.generatedRecipe.coverImageKey
              ? `/api/recipes/media/${source.generatedRecipe.id}${
                  privateCoverNeedsToken
                    ? `?accessToken=${encodeURIComponent(accessToken)}`
                    : ""
                }`
              : null,
            visibility: source.generatedRecipe.visibility.toLowerCase(),
          }
        : null,
    },
    { status: queued ? 202 : 200 },
  );
}

async function submitLink(
  url: string,
  accessToken: string,
  userId: string | null,
) {
  let normalized;
  try {
    normalized = await normalizeVideoUrl(url);
  } catch (error) {
    return errorResponse(
      "UNSUPPORTED_URL",
      error instanceof Error ? error.message : "The video URL is not supported.",
      400,
    );
  }

  let result;
  try {
    result = await createOrReuseVideoSource({
      ...normalized,
      requestedById: userId,
      accessToken,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Video recipe not found.") {
      return errorResponse("NOT_FOUND", "Video recipe not found.", 404);
    }
    console.error("Unable to create video source:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to process this video.", 500);
  }

  if (!result.shouldQueue) {
    let source = result.source;
    try {
      const attribution = await fetchSourceCreatorMetadata(normalized.canonicalUrl);
      source = (await updateVideoSourceAttribution(source.id, attribution)) ?? source;
    } catch (error) {
      console.warn("Unable to refresh cached recipe attribution:", error);
    }
    return sourceResponse(source, accessToken, source.status !== "READY", userId);
  }

  try {
    const inspection = await inspectVideoUrl(normalized.canonicalUrl);
    const inspected: unknown = await inspection.json();
    if (!inspection.ok || !isRecord(inspected) || !("result" in inspected)) {
      const inspectionError =
        isRecord(inspected) && isRecord(inspected.error)
          ? inspected.error
          : null;
      const code =
        inspectionError && typeof inspectionError.code === "string"
          ? inspectionError.code
          : "VIDEO_UNAVAILABLE";
      const message =
        inspectionError &&
        typeof inspectionError.message === "string" &&
        inspectionError.message.trim()
          ? inspectionError.message
          : "The video is unavailable from the source platform. Confirm the link is public and try again.";
      await failVideoSource(result.source.id, message);
      return errorResponse(
        code,
        message,
        inspection.status >= 400 ? inspection.status : 502,
      );
    }
    const downloadable = getDownloadableVideo(inspected.result);
    if (!downloadable) {
      await failVideoSource(result.source.id, "No supported video download was found.");
      return errorResponse(
        "VIDEO_UNAVAILABLE",
        "The video service did not return a downloadable video.",
        422,
      );
    }

    const attribution = await fetchSourceCreatorMetadata(
      normalized.canonicalUrl,
      inspected.result,
    );
    const source =
      (await updateVideoSourceAttribution(result.source.id, attribution)) ??
      result.source;
    await enqueue("recipe.extraction", {
      sourceId: source.id,
      downloadUrl: downloadable.url,
      description: downloadable.description,
    });
    return sourceResponse(source, accessToken, true, userId);
  } catch (error) {
    await failVideoSource(
      result.source.id,
      error instanceof Error ? error.message : "Unable to queue video extraction.",
    );
    console.error("Unable to queue video extraction:", error);
    return errorResponse("QUEUE_UNAVAILABLE", "Unable to start recipe extraction.", 503);
  }
}

async function submitUpload(
  request: Request,
  accessToken: string,
  userId: string | null,
) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request must contain form data.", 400);
  }
  const file = formData.get("video");
  if (!(file instanceof File)) {
    return errorResponse("INVALID_REQUEST", "A video file is required.", 400);
  }
  if (
    !file.type.startsWith("video/") ||
    !/\.(mp4|mov|webm|m4v)$/i.test(file.name)
  ) {
    return errorResponse(
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload an MP4, MOV, WebM, or M4V video.",
      400,
    );
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(
      file.size === 0 ? "EMPTY_FILE" : "FILE_TOO_LARGE",
      file.size === 0 ? "The selected video is empty." : "Maximum video size is 25 MB.",
      file.size === 0 ? 400 : 413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceHash = hashUploadedVideo(bytes);
  let result;
  try {
    result = await createOrReuseVideoSource({
      sourceType: "UPLOAD",
      platform: null,
      originalUrl: null,
      canonicalUrl: null,
      videoId: null,
      sourceHash,
      requestedById: userId,
      accessToken,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Video recipe not found.") {
      return errorResponse("NOT_FOUND", "Video recipe not found.", 404);
    }
    console.error("Unable to create uploaded video source:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to process this video.", 500);
  }
  if (!result.shouldQueue) {
    return sourceResponse(
      result.source,
      accessToken,
      result.source.status !== "READY",
      userId,
    );
  }

  try {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "mp4";
    const blobKey = await uploadAttachment(
      result.source.id,
      `source.${extension}`,
      file.type,
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );
    await setVideoUploadBlob(result.source.id, blobKey);
    await enqueue("recipe.extraction", { sourceId: result.source.id });
    return sourceResponse(result.source, accessToken, true, userId);
  } catch (error) {
    await failVideoSource(
      result.source.id,
      error instanceof Error ? error.message : "Unable to store uploaded video.",
    );
    console.error("Unable to queue uploaded video:", error);
    return errorResponse("QUEUE_UNAVAILABLE", "Unable to start recipe extraction.", 503);
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.clone().formData().catch(() => null);
    return submitUpload(
      request,
      priorAccessToken(formData?.get("accessToken")),
      userId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be JSON.", 400);
  }
  if (
    !isRecord(body) ||
    typeof body.url !== "string" ||
    body.url.length > 2_048
  ) {
    return errorResponse("INVALID_REQUEST", "Provide a supported video URL.", 400);
  }
  return submitLink(
    body.url,
    priorAccessToken(body.accessToken),
    userId,
  );
}

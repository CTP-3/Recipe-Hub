import { currentUserId } from "@project/auth";
import {
  failVideoSource,
  getVideoSourceForWorker,
  queueRecipeRegeneration,
  updateVideoSourceAttribution,
} from "@project/domain";
import { enqueue } from "@project/services";
import {
  getDownloadableVideo,
  fetchSourceCreatorMetadata,
  inspectVideoUrl,
} from "../../../../../../lib/inspect-video";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }
  const { sourceId } = await params;
  try {
    const source = await queueRecipeRegeneration(userId, sourceId);
    if (!source?.canonicalUrl) {
      return errorResponse("NOT_FOUND", "Recipe not found.", 404);
    }

    const inspection = await inspectVideoUrl(source.canonicalUrl);
    const inspected: unknown = await inspection.json();
    if (!inspection.ok || !inspected || typeof inspected !== "object" || !("result" in inspected)) {
      await failVideoSource(source.id, "The video could not be inspected.");
      return errorResponse("VIDEO_UNAVAILABLE", "The video could not be inspected.", 502);
    }
    const downloadable = getDownloadableVideo(inspected.result);
    if (!downloadable) {
      await failVideoSource(source.id, "No supported video download was found.");
      return errorResponse("VIDEO_UNAVAILABLE", "No video download was found.", 422);
    }

    const attribution = await fetchSourceCreatorMetadata(
      source.canonicalUrl,
      inspected.result,
    );
    await updateVideoSourceAttribution(source.id, attribution);
    await enqueue("recipe.extraction", {
      sourceId: source.id,
      downloadUrl: downloadable.url,
      description: downloadable.description,
    });
    const updated = await getVideoSourceForWorker(source.id);
    return Response.json(
      { sourceId: source.id, status: updated?.status.toLowerCase() ?? "queued" },
      { status: 202 },
    );
  } catch (error) {
    await failVideoSource(
      sourceId,
      error instanceof Error ? error.message : "Unable to start recipe regeneration.",
    );
    console.error("Unable to regenerate recipe:", error);
    return errorResponse("QUEUE_UNAVAILABLE", "Unable to regenerate this recipe.", 503);
  }
}

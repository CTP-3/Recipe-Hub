import { currentUserId } from "@project/auth";
import { getVideoRecipeJob, INTERRUPTED_MESSAGE } from "@project/domain";
import {
  EXTRACTION_TIMEOUT_MESSAGE,
  EXTRACTION_UNAVAILABLE_MESSAGE,
  LINK_VIDEO_TOO_LARGE_MESSAGE,
} from "@project/services";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const SAFE_EXTRACTION_ERRORS = new Set([
  LINK_VIDEO_TOO_LARGE_MESSAGE,
  EXTRACTION_TIMEOUT_MESSAGE,
  EXTRACTION_UNAVAILABLE_MESSAGE,
  INTERRUPTED_MESSAGE,
  "No supported video download was found.",
  "The video could not be inspected.",
  "The downloaded video is empty.",
  "Uploaded video is empty.",
  "Uploaded video exceeds the 25 MB limit. Choose a video no larger than 25 MB.",
  "Classroom AI rate limit reached. Please try again later.",
  "Classroom AI recipe generation failed.",
  "Classroom AI returned an invalid recipe.",
  "Classroom AI credentials are not configured.",
  "Panoscribe transcription failed.",
  "Panoscribe API request failed.",
  "Panoscribe transcription timed out.",
  "Video download failed.",
  "Video download redirects are not supported.",
  "The download URL did not return a video.",
  "No spoken text, on-screen text, or description was found.",
  "Uploaded video is unavailable.",
  "Uploaded video could not be read from storage.",
  "Uploaded video exceeds the processing limit.",
  "Recipe extraction service returned invalid JSON.",
  "Extraction service returned an invalid recipe.",
]);

function publicExtractionError(message: string | null): string {
  if (!message) return "Recipe extraction failed. Retry the extraction.";
  if (
    SAFE_EXTRACTION_ERRORS.has(message) ||
    /^Recipe extraction failed \(HTTP [45]\d\d\)\.$/.test(message)
  ) {
    return message;
  }
  return "Recipe extraction failed. Retry the extraction.";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  const token = request.headers.get("x-recipe-access-token");
  if (token && !/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    return errorResponse("NOT_FOUND", "Recipe job not found.", 404);
  }

  try {
    const userId = await currentUserId();
    const source = await getVideoRecipeJob(
      sourceId,
      userId,
      token,
    );
    if (!source) return errorResponse("NOT_FOUND", "Recipe job not found.", 404);

    return Response.json({
      sourceId: source.id,
      status: source.status.toLowerCase(),
      sourcePlatform: source.sourcePlatform ?? source.platform,
      sourceVideoUrl: source.sourceVideoUrl ?? source.canonicalUrl ?? source.originalUrl,
      sourceVideoId: source.sourceVideoId ?? source.videoId,
      sourceCreatorUsername: source.sourceCreatorUsername,
      sourceCreatorName: source.sourceCreatorName,
      sourceCreatorProfileUrl: source.sourceCreatorProfileUrl,
      error:
        source.status === "FAILED" ||
        (source.status === "READY" && source.errorMessage)
          ? publicExtractionError(source.errorMessage)
          : null,
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
                  userId === null &&
                  source.generatedRecipe.visibility === "PRIVATE"
                    ? `?accessToken=${encodeURIComponent(token ?? "")}`
                    : ""
                }`
              : null,
            visibility: source.generatedRecipe.visibility.toLowerCase(),
          }
        : null,
    });
  } catch (error) {
    console.error("Unable to read recipe job:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load recipe status.", 500);
  }
}

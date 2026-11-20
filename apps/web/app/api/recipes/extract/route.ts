// Next.js API route for recipe extraction. This route handles POST requests to extract recipes from uploaded video files. 
// It validates the uploaded file, checks its type and size, and forwards the request to an external recipe extraction service. 
// The response from the service is returned to the client, along with appropriate error handling for various failure scenarios.
import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@project/auth";
import { recipeServiceUrl } from "../service-url";

export const runtime = "nodejs";

const MAX_SIZE = 25 * 1024 * 1024;
const EXTRACTION_TIMEOUT_MS = 15 * 60 * 1000;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isValidRecipeResponse(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.recipe)) return false;

  const { recipe } = value;
  return (
    typeof recipe.title === "string" &&
    recipe.title.trim().length > 0 &&
    Array.isArray(recipe.ingredients) &&
    Array.isArray(recipe.instructions)
  );
}

export async function POST(request: NextRequest) {
  if (!(await currentUserId())) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request must contain form data.", 400);
  }

  const video = formData.get("video");
  if (!(video instanceof File)) {
    return errorResponse("INVALID_REQUEST", "A video file is required.", 400);
  }

  if (!video.type.startsWith("video/")) {
    return errorResponse(
      "UNSUPPORTED_MEDIA_TYPE",
      "Only video files are supported.",
      400,
    );
  }

  if (video.size > MAX_SIZE) {
    return errorResponse("FILE_TOO_LARGE", "Maximum video size is 25 MB.", 413);
  }

  if (video.size === 0) {
    return errorResponse("EMPTY_FILE", "The selected video is empty.", 400);
  }

  try {
    const serviceData = new FormData();
    serviceData.append("video", video, video.name);

    let response: Response;
    try {
      response = await fetch(recipeServiceUrl("extract"), {
        method: "POST",
        body: serviceData,
        signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return errorResponse(
          "EXTRACTION_TIMEOUT",
          "Recipe extraction took too long. Please try again.",
          504,
        );
      }

      console.error("Recipe extraction service request failed:", error);
      return errorResponse(
        "SERVICE_UNAVAILABLE",
        "Recipe extraction service is unavailable. Please try again.",
        502,
      );
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      return errorResponse(
        "INVALID_SERVICE_RESPONSE",
        "Recipe extraction service returned an invalid response.",
        502,
      );
    }

    if (!response.ok) {
      const detail =
        isRecord(result) && typeof result.detail === "string"
          ? result.detail
          : "Recipe extraction failed. Please try again.";
      return errorResponse("EXTRACTION_FAILED", detail, response.status);
    }

    if (!isValidRecipeResponse(result)) {
      return errorResponse(
        "INVALID_SERVICE_RESPONSE",
        "Recipe extraction service did not return a valid recipe.",
        502,
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Recipe extraction error:", error);

    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to process the uploaded video.",
      500,
    );
  }
}

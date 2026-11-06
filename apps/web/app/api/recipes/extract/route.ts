
import { NextRequest, NextResponse } from "next/server";
import { recipeServiceUrl } from "../service-url";

export const runtime = "nodejs";

const MAX_SIZE = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        { error: "A video file is required." },
        { status: 400 }
      );
    }

    if (!video.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "Only video files are supported." },
        { status: 400 }
      );
    }

    if (video.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Maximum video size is 25 MB." },
        { status: 413 }
      );
    }

    const serviceData = new FormData();
    serviceData.append("video", video);

    const response = await fetch(recipeServiceUrl("extract"), {
      method: "POST",
      body: serviceData,
      signal: AbortSignal.timeout(300000),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.detail ?? "Recipe extraction failed." },
        { status: response.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Recipe extraction error:", error);

    return NextResponse.json(
      { error: "Unable to process video." },
      { status: 500 }
    );
  }
}

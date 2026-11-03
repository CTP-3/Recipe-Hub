import { currentUserId } from "@project/auth";

export const runtime = "nodejs";

const MAX_DOWNLOAD_URL_LENGTH = 16_384;
const MAX_DESCRIPTION_LENGTH = 10_000;
const DOWNLOAD_HOST = "edge-api-v3.smvd.xyz";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  await currentUserId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be JSON.", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("downloadUrl" in body) ||
    typeof body.downloadUrl !== "string" ||
    body.downloadUrl.length > MAX_DOWNLOAD_URL_LENGTH ||
    !("description" in body) ||
    typeof body.description !== "string" ||
    body.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return errorResponse(
      "INVALID_REQUEST",
      "Provide a video download URL and description.",
      400,
    );
  }

  let downloadUrl: URL;
  try {
    downloadUrl = new URL(body.downloadUrl);
  } catch {
    return errorResponse("INVALID_URL", "Provide a valid video download URL.", 400);
  }

  if (
    downloadUrl.protocol !== "https:" ||
    downloadUrl.hostname.toLowerCase() !== DOWNLOAD_HOST ||
    !downloadUrl.pathname.startsWith("/rproxy/") ||
    downloadUrl.username ||
    downloadUrl.password
  ) {
    return errorResponse(
      "UNSUPPORTED_URL",
      "The video download URL is not supported.",
      400,
    );
  }

  const configuredUrl =
    process.env.RECIPE_SERVICE_URL ?? "http://127.0.0.1:8000/extract";
  const serviceUrl = configuredUrl.replace(/\/extract\/?$/, "/extract-link");

  let response: Response;
  try {
    response = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        download_url: downloadUrl.toString(),
        description: body.description,
      }),
      signal: AbortSignal.timeout(300_000),
      cache: "no-store",
    });
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", "Recipe extraction service is unavailable.", 502);
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
      result &&
      typeof result === "object" &&
      "detail" in result &&
      typeof result.detail === "string"
        ? result.detail
        : "Recipe extraction failed.";
    return errorResponse("EXTRACTION_FAILED", detail, response.status);
  }

  return Response.json(result);
}
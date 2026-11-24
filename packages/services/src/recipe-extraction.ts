import { Agent } from "undici";

type Endpoint = "extract" | "extract-link";

const EXTRACTION_TIMEOUT_MS = 15 * 60 * 1_000;
export const EXTRACTION_UNAVAILABLE_MESSAGE =
  "Recipe extraction service is unavailable.";
export const EXTRACTION_TIMEOUT_MESSAGE = "Recipe extraction timed out.";

// Node's fetch gives up after 5 minutes without response headers, which is
// shorter than a long transcription; the AbortSignal is the real limit.
const extractionAgent = new Agent({
  headersTimeout: EXTRACTION_TIMEOUT_MS,
  bodyTimeout: EXTRACTION_TIMEOUT_MS,
});

async function postToExtractionService(
  endpoint: Endpoint,
  init: RequestInit,
): Promise<Response> {
  const options: RequestInit & { dispatcher: Agent } = {
    ...init,
    method: "POST",
    signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
    cache: "no-store",
    dispatcher: extractionAgent,
  };
  try {
    return await fetch(recipeServiceUrl(endpoint), options);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(EXTRACTION_TIMEOUT_MESSAGE, { cause: error });
    }
    throw new Error(EXTRACTION_UNAVAILABLE_MESSAGE, { cause: error });
  }
}

export const LINK_VIDEO_TOO_LARGE_MESSAGE =
  "Linked video exceeds the 250 MB limit. Choose a video no larger than 250 MB.";
const UPLOAD_VIDEO_TOO_LARGE_MESSAGE =
  "Uploaded video exceeds the 25 MB limit. Choose a video no larger than 25 MB.";

export function recipeServiceUrl(endpoint: Endpoint): URL {
  const serviceUrl = new URL(process.env.RECIPE_SERVICE_URL ?? "http://127.0.0.1:8001");
  const pathname = serviceUrl.pathname.replace(/\/+$/, "");
  const endpointIndex = pathname.lastIndexOf("/extract");
  const hasEndpoint =
    endpointIndex >= 0 &&
    (pathname.slice(endpointIndex) === "/extract" ||
      pathname.slice(endpointIndex) === "/extract-link");
  serviceUrl.pathname = `${hasEndpoint ? pathname.slice(0, endpointIndex) : pathname}/${endpoint}`;
  return serviceUrl;
}

async function readExtractionResponse(
  response: Response,
  tooLargeMessage: string,
): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error(tooLargeMessage);
    }
    let detail: unknown;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body) {
        detail = body.detail;
      }
    } catch {
      // Some proxies return an HTML error page instead of the service JSON.
    }
    if (typeof detail === "string" && detail.trim()) {
      throw new Error(detail.slice(0, 500));
    }
    throw new Error(`Recipe extraction failed (HTTP ${response.status}).`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Recipe extraction service returned invalid JSON.");
  }
  return body;
}

export async function extractRecipeFromLink(
  downloadUrl: string,
  description: string,
): Promise<unknown> {
  const response = await postToExtractionService("extract-link", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ download_url: downloadUrl, description }),
  });
  return readExtractionResponse(response, LINK_VIDEO_TOO_LARGE_MESSAGE);
}

export async function extractRecipeFromUpload(
  data: Uint8Array,
  filename: string,
): Promise<unknown> {
  const formData = new FormData();
  const bytes = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  formData.append("video", new Blob([bytes], { type: "video/mp4" }), filename);
  const response = await postToExtractionService("extract", { body: formData });
  return readExtractionResponse(response, UPLOAD_VIDEO_TOO_LARGE_MESSAGE);
}

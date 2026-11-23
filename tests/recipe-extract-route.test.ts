import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({ userId: "user-id" as string | null }));

vi.mock("../packages/auth/src/auth", () => ({
  auth: vi.fn(async () =>
    sessionState.userId ? { user: { id: sessionState.userId } } : null,
  ),
}));

import { POST } from "../apps/web/app/api/recipes/extract/route";
import { POST as extractLink } from "../apps/web/app/api/recipes/extract-link/route";

const originalServiceUrl = process.env.RECIPE_SERVICE_URL;
const fetchMock = vi.fn<typeof fetch>();

const recipeResponse = {
  model: "generate",
  transcription_provider: "panoscribe",
  transcript: "Mix the ingredients.",
  ocr_candidates: [],
  recipe: {
    title: "Test recipe",
    description: "A test recipe.",
    servings: null,
    prep_time: null,
    cook_time: null,
    ingredients: [
      {
        name: "flour",
        quantity: 1,
        unit: "cup",
        estimated: false,
        said: "one cup flour",
        notes: "sifted",
      },
      {
        name: "paprika",
        quantity: "1 tsp",
        unit: null,
        estimated: true,
        said: "some paprika",
        notes: "Estimated from the spoken wording.",
      },
    ],
    instructions: ["Mix the ingredients."],
    equipment: [],
    temperature: null,
    dietary_tags: [],
    missing_information: [],
  },
};

function uploadRequest() {
  const formData = new FormData();
  formData.append("video", new File(["video bytes"], "recipe.mp4", {
    type: "video/mp4",
  }));
  return new Request("http://localhost/api/recipes/extract", {
    method: "POST",
    body: formData,
  }) as Parameters<typeof POST>[0];
}

function linkRequest() {
  return new Request("http://localhost/api/recipes/extract-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      downloadUrl: "https://edge-api-v3.smvd.xyz/rproxy/video",
      description: "A cooking video",
    }),
  });
}

beforeEach(() => {
  sessionState.userId = "user-id";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.RECIPE_SERVICE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalServiceUrl === undefined) {
    delete process.env.RECIPE_SERVICE_URL;
  } else {
    process.env.RECIPE_SERVICE_URL = originalServiceUrl;
  }
});

describe("POST /api/recipes/extract", () => {
  it("allows signed-out visitors to preview generated recipes", async () => {
    sessionState.userId = null;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(recipeResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(recipeResponse);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("allows signed-out visitors to generate a recipe from a video link", async () => {
    sessionState.userId = null;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(recipeResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await extractLink(linkRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(recipeResponse);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8001/extract-link",
    );
  });

  it("forwards the uploaded file and returns the structured recipe", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(recipeResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(recipeResponse);
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:8001/extract");
    expect(options?.method).toBe("POST");
    const forwardedVideo = (options?.body as FormData | undefined)?.get("video");
    expect(forwardedVideo).toBeInstanceOf(File);
    expect(forwardedVideo).toMatchObject({
      name: "recipe.mp4",
      type: "video/mp4",
    });
  });

  it("returns backend errors in the standard shape", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Panoscribe transcription failed." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "EXTRACTION_FAILED",
        message: "Panoscribe transcription failed.",
      },
    });
  });

  it("does not return success for a response without a structured recipe", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ recipe: { title: "Incomplete" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_SERVICE_RESPONSE",
        message: "Recipe extraction service did not return a valid recipe.",
      },
    });
  });

  it("reports extraction timeouts without hiding the retry path", async () => {
    fetchMock.mockRejectedValue(new DOMException("Request timed out", "TimeoutError"));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "EXTRACTION_TIMEOUT",
        message: "Recipe extraction took too long. Please try again.",
      },
    });
  });
});

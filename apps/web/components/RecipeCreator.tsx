

"use client";

import { useEffect, useId, useState } from "react";

type Ingredient = string | {
  name?: string;
  quantity?: string | number | null;
  unit?: string | null;
  estimated?: boolean;
  said?: string | null;
  notes?: string | null;
};

type Instruction = string | {
  step?: number;
  instruction?: string;
};

type Recipe = {
  title: string;
  description?: string | null;
  servings?: string | number | null;
  prep_time?: string | null;
  cook_time?: string | null;
  temperature?: string | null;
  ingredients?: Ingredient[];
  instructions?: Instruction[];
  tips?: string[];
  equipment?: string[];
  dietary_tags?: string[];
  missing_information?: string[] | string | null;
};

type OcrCandidate = {
  time: number;
  text: string;
};

type ExtractionResult = {
  model?: string;
  transcript?: string;
  ocr_candidates?: OcrCandidate[];
  recipe: Recipe;
};

type DownloadableVideo = {
  label: string;
  url: string;
  description: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isIngredient(value: unknown): value is Ingredient {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;

  return (
    (value.name === undefined || typeof value.name === "string") &&
    (value.quantity === undefined ||
      value.quantity === null ||
      typeof value.quantity === "string" ||
      typeof value.quantity === "number") &&
    (value.unit === undefined ||
      value.unit === null ||
      typeof value.unit === "string") &&
    (value.estimated === undefined || typeof value.estimated === "boolean") &&
    (value.said === undefined ||
      value.said === null ||
      typeof value.said === "string") &&
    (value.notes === undefined ||
      value.notes === null ||
      typeof value.notes === "string")
  );
}

function isInstruction(value: unknown): value is Instruction {
  if (typeof value === "string") return true;
  return (
    isRecord(value) &&
    (value.step === undefined || typeof value.step === "number") &&
    typeof value.instruction === "string"
  );
}

function isRecipe(value: unknown): value is Recipe {
  if (!isRecord(value)) return false;

  return (
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    (value.description === undefined ||
      value.description === null ||
      typeof value.description === "string") &&
    (value.servings === undefined ||
      value.servings === null ||
      typeof value.servings === "string" ||
      typeof value.servings === "number") &&
    (value.prep_time === undefined ||
      value.prep_time === null ||
      typeof value.prep_time === "string") &&
    (value.cook_time === undefined ||
      value.cook_time === null ||
      typeof value.cook_time === "string") &&
    (value.temperature === undefined ||
      value.temperature === null ||
      typeof value.temperature === "string") &&
    Array.isArray(value.ingredients) &&
    value.ingredients.every(isIngredient) &&
    Array.isArray(value.instructions) &&
    value.instructions.every(isInstruction) &&
    (value.equipment === undefined ||
      (Array.isArray(value.equipment) &&
        value.equipment.every((item) => typeof item === "string"))) &&
    (value.tips === undefined ||
      (Array.isArray(value.tips) &&
        value.tips.every((item) => typeof item === "string"))) &&
    (value.dietary_tags === undefined ||
      (Array.isArray(value.dietary_tags) &&
        value.dietary_tags.every((item) => typeof item === "string"))) &&
    (value.missing_information === undefined ||
      value.missing_information === null ||
      typeof value.missing_information === "string" ||
      (Array.isArray(value.missing_information) &&
        value.missing_information.every((item) => typeof item === "string")))
  );
}

function isExtractionResult(value: unknown): value is ExtractionResult {
  return (
    isRecord(value) &&
    isRecipe(value.recipe) &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.transcript === undefined || typeof value.transcript === "string") &&
    (value.ocr_candidates === undefined ||
      (Array.isArray(value.ocr_candidates) &&
        value.ocr_candidates.every(
          (item) =>
            isRecord(item) &&
            typeof item.time === "number" &&
            typeof item.text === "string"
        )))
  );
}

function getErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.error === "string") return value.error;
  if (isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  if (typeof value.detail === "string") return value.detail;
  return null;
}

async function readExtractionResponse(response: Response): Promise<ExtractionResult> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("The recipe service returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(value) ??
        `Recipe extraction failed (HTTP ${response.status}).`
    );
  }

  if (!isExtractionResult(value)) {
    throw new Error(
      "The recipe service did not return a valid structured recipe."
    );
  }

  return value;
}

function getDownloadableVideo(result: unknown): DownloadableVideo | null {
  if (!isRecord(result) || !Array.isArray(result.contents)) {
    return null;
  }

  const contents: unknown[] = result.contents;
  for (const content of contents) {
    if (!isRecord(content) || !Array.isArray(content.videos)) {
      continue;
    }

    const videos: unknown[] = content.videos;
    for (const video of videos) {
      if (!isRecord(video) || typeof video.url !== "string") {
        continue;
      }

      try {
        const url = new URL(video.url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "edge-api-v3.smvd.xyz" ||
          !url.pathname.startsWith("/rproxy/") ||
          url.username ||
          url.password
        ) {
          continue;
        }

        return {
          label: typeof video.label === "string" ? video.label : "Video",
          url: url.toString(),
          description: url.searchParams.get("dl") ?? "",
        };
      } catch {
        continue;
      }
    }
  }

  return null;
}

const MAX_SIZE = 25 * 1024 * 1024;

export default function RecipeCreator() {
  const inputId = useId();

  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [downloadableVideo, setDownloadableVideo] =
    useState<DownloadableVideo | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [transcript, setTranscript] = useState("");
  const [ocrCandidates, setOcrCandidates] = useState<OcrCandidate[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Release the previous preview URL when it changes.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleUpload(file?: File) {
    if (loading) return;

    setError("");
    setMessage("");
    setDownloadableVideo(null);
    setRecipe(null);
    setTranscript("");
    setOcrCandidates([]);
    setModel("");
    setVideo(null);
    setPreview(null);

    if (!file) return;

    if (
      !file.type.startsWith("video/") ||
      ![".mp4", ".mov", ".webm", ".m4v"].some(
        (ext) => file.name.toLowerCase().endsWith(ext)
      )
    ) {
      setError("Please upload an MP4, MOV, WebM, or M4V video.");
      return;
    }

    if (file.size > MAX_SIZE) {
      setError("Video must be 25 MB or smaller.");
      return;
    }

    if (file.size === 0) {
      setError("The selected video is empty.");
      return;
    }

    setVideo(file);
    setPreview(URL.createObjectURL(file));
    setMessage(`${file.name} is ready to process.`);
  }

  async function handleGenerate() {
    if (!video || loading) {
      if (!video) setError("Please select a video first.");
      return;
    }

    setLoading(true);
    setError("");
    setRecipe(null);
    setTranscript("");
    setOcrCandidates([]);
    setMessage(
      "Processing your video. Panoscribe is transcribing speech and reading on-screen text before the configured recipe model generates a recipe."
    );

    try {
      const formData = new FormData();
      formData.append("video", video);

      const response = await fetch("/api/recipes/extract", {
        method: "POST",
        body: formData,
      });

      const data = await readExtractionResponse(response);

      setRecipe(data.recipe);
      setTranscript(data.transcript ?? "");
      setOcrCandidates(data.ocr_candidates ?? []);
      setModel(data.model ?? "");
      setMessage("Recipe generated successfully!");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while processing the video."
      );
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  // URL input
  async function handleGenerateFromUrl() {
    if (!videoUrl.trim() || loading) {
      if (!videoUrl.trim()) setError("Please enter a video link first.");
      return;
    }

    setLoading(true);
    setError("");
    setDownloadableVideo(null);
    setRecipe(null);
    setTranscript("");
    setOcrCandidates([]);
    setModel("");
    setMessage("Checking the video link...");

    try {
      const response = await fetch("/api/media/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim() }),
      });

      const data: {
        platform?: string;
        result?: unknown;
        error?: { message?: string };
      } = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.error?.message === "string"
            ? data.error.message
            : "Could not inspect this video link."
        );
      }

      if (!data.platform || data.result === undefined) {
        throw new Error("The video service returned an unexpected response.");
      }

      const downloadableVideo = getDownloadableVideo(data.result);
      setDownloadableVideo(downloadableVideo);

      if (!downloadableVideo) {
        throw new Error("The video service did not return a downloadable video.");
      }

      await generateRecipeFromLink(downloadableVideo);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while processing the video."
      );
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  async function generateRecipeFromLink(downloadableVideo: DownloadableVideo) {
    setMessage("Downloading and processing the video. This may take a few minutes.");

    const response = await fetch("/api/recipes/extract-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        downloadUrl: downloadableVideo.url,
        description: downloadableVideo.description,
      }),
    });

    const data = await readExtractionResponse(response);

    setRecipe(data.recipe);
    setTranscript(data.transcript ?? "");
    setOcrCandidates(data.ocr_candidates ?? []);
    setModel(data.model ?? "");
    setMessage("Recipe generated successfully!");
  }

  async function handleRetryLinkExtraction() {
    if (!downloadableVideo || loading) return;

    setLoading(true);
    setError("");
    setRecipe(null);
    setTranscript("");
    setOcrCandidates([]);
    setModel("");

    try {
      await generateRecipeFromLink(downloadableVideo);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while processing the video."
      );
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  function formatIngredient(item: Ingredient): string {
    if (typeof item === "string") return item;

    return [
      item.quantity,
      item.unit,
      item.name,
    ]
      .filter((part) => part !== null && part !== undefined && part !== "")
      .join(" ");
  }

  function formatInstruction(item: Instruction): string {
    return typeof item === "string"
      ? item
      : item.instruction ?? "";
  }

  return (
    <section
      aria-label="Create a recipe from a video"
      className="mx-auto max-w-3xl px-4 py-10 text-green-900"
    >
      {/* Page heading */}
      <header className="mb-8">
        <p className="mb-4 text-2xl font-bold uppercase tracking-wide text-emerald-700">
          Recipe Hub
        </p>

        <h2 className="text-4xl font-bold">
          Turn a video into a recipe 🍲
        </h2>

        <p className="mt-3 text-neutral-700">
          Upload a cooking video
          and extract the ingredients, instructions, and
          full recipe details.
        </p>
      </header>

      {/* Upload section */}
      <section
        aria-labelledby="upload-heading"
        className="rounded-xl border border-neutral-400 bg-white p-6 shadow-sm"
      >
        <h2
          id="upload-heading"
          className="mb-4 text-xl font-semibold"
        >
          Upload your video
        </h2>

        <label
          htmlFor={inputId}
          className="mb-2 block font-medium"
        >
          Choose a cooking video
        </label>

        <input
          id={inputId}
          type="file"
          accept=".mp4,.mov,.webm,.m4v,video/*"
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${inputId}-error` : `${inputId}-help`
          }
          onChange={(event) => {
            handleUpload(event.target.files?.[0]);
          }}
          className="block w-full rounded-lg border border-neutral-500 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-50"
        />

        <p
          id={`${inputId}-help`}
          className="mt-2 text-sm text-neutral-600"
        >
          Supported formats: MP4, MOV, WebM, M4V.
          Maximum file size: 25 MB.
        </p>

        {/* Video preview */}
        {preview && (
          <div className="mt-6">
            <h3 className="mb-3 font-semibold">
              Video Preview
            </h3>

            <video
              key={preview}
              controls
              preload="metadata"
              src={preview}
              className="w-full rounded-lg bg-black"
            >
              Your browser does not support video playback.
            </video>

            <p className="mt-2 break-all text-sm text-neutral-600">
              Selected: {video?.name}
            </p>
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!video || loading}
          className="mt-6 min-h-11 w-full rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Generating Recipe..." : "Generate Recipe"}
        </button>

        <div className="my-6 border-t border-neutral-300" />

        <h3 className="mb-3 text-lg font-semibold">Or use a video link</h3>
        <label htmlFor={`${inputId}-url`} className="mb-2 block font-medium">
          YouTube, TikTok, or Instagram link
        </label>
        <input
          id={`${inputId}-url`}
          type="url"
          value={videoUrl}
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : `${inputId}-url-help`}
          onChange={(event) => setVideoUrl(event.target.value)}
          placeholder="https://www.tiktok.com/..."
          className="block w-full rounded-lg border border-neutral-500 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-50"
        />
        <p id={`${inputId}-url-help`} className="mt-2 text-sm text-neutral-600">
          Inspect public video details and available media options.
        </p>
        <button
          type="button"
          onClick={handleGenerateFromUrl}
          disabled={!videoUrl.trim() || loading}
          className="mt-4 min-h-11 w-full rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Processing Video..." : "Download and Generate Recipe"}
        </button>

        {downloadableVideo && error && !recipe && (
          <button
            type="button"
            onClick={handleRetryLinkExtraction}
            disabled={loading}
            className="mt-4 min-h-11 w-full rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Generating Recipe..." : "Retry Recipe Generation"}
          </button>
        )}

        {/* Processing indicator */}
        {loading && (
          <div className="mt-4 flex items-center gap-3">
            <div
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent"
            />
            <p className="text-sm text-neutral-700">
              Processing video. Please keep this page open.
            </p>
          </div>
        )}

        {/* Status messages */}
        <div
          role="status"
          aria-live="polite"
          className="mt-4 text-sm text-neutral-700"
        >
          {message}
        </div>

        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="mt-3 font-medium text-red-700"
          >
            {error}
          </p>
        )}
      </section>

      {/* Recipe results */}
      <section
        aria-labelledby="recipe-heading"
        className="mt-8 rounded-xl border border-neutral-400 bg-white p-6 shadow-sm"
      >
        <h2
          id="recipe-heading"
          className="text-xl font-semibold"
        >
          Your Recipe
        </h2>

        {!recipe ? (
          <p className="mt-3 text-neutral-700">
            Your extracted recipe will appear here after
            processing your video.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Recipe title */}
            <div>
              <h3 className="text-2xl font-bold">
                {recipe.title || "Untitled Recipe"}
              </h3>

              {recipe.description && (
                <p className="mt-2 text-neutral-700">
                  {recipe.description}
                </p>
              )}

              {model && (
                <p className="mt-2 text-xs text-neutral-600">
                  Generated using {model}
                </p>
              )}
            </div>

            {/* Recipe details */}
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-neutral-100 p-4 text-sm sm:grid-cols-3">
              <p>
                <strong>Servings:</strong>{" "}
                {recipe.servings ?? "Unknown"}
              </p>
              <p>
                <strong>Prep:</strong>{" "}
                {recipe.prep_time ?? "Unknown"}
              </p>
              <p>
                <strong>Cook:</strong>{" "}
                {recipe.cook_time ?? "Unknown"}
              </p>

              {recipe.temperature && (
                <p>
                  <strong>Temperature:</strong>{" "}
                  {recipe.temperature}
                </p>
              )}
            </div>

            {/* Ingredients */}
            <div>
              <h3 className="text-lg font-semibold">
                Ingredients
              </h3>

              {recipe.ingredients?.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  {recipe.ingredients.map((item, index) => (
                    <li key={index}>
                      <span>{formatIngredient(item)}</span>
                      {typeof item !== "string" && item.estimated && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          Estimated
                        </span>
                      )}
                      {typeof item !== "string" && item.said && (
                        <p className="mt-1 text-sm text-neutral-600">
                          Said: {item.said}
                        </p>
                      )}
                      {typeof item !== "string" && item.notes && (
                        <p className="mt-1 text-sm text-neutral-600">
                          {item.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-neutral-600">
                  No ingredients identified.
                </p>
              )}
            </div>

            {/* Instructions */}
            <div>
              <h3 className="text-lg font-semibold">
                Instructions
              </h3>

              {recipe.instructions?.length ? (
                <ol className="mt-3 list-decimal space-y-3 pl-6">
                  {recipe.instructions.map((item, index) => (
                    <li key={index}>
                      {formatInstruction(item)}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-neutral-600">
                  No cooking instructions identified.
                </p>
              )}
            </div>

            {/* Equipment */}
            {recipe.equipment?.length ? (
              <div>
                <h3 className="text-lg font-semibold">
                  Equipment
                </h3>
                <ul className="mt-2 list-disc pl-6">
                  {recipe.equipment?.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {recipe.tips?.length ? (
            <div>
              <h3 className="text-lg font-semibold">Tips</h3>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {recipe.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
            ) : null}

            {recipe.dietary_tags?.length ? (
              <div>
                <h3 className="text-lg font-semibold">Dietary information</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {recipe.dietary_tags.map((tag, index) => (
                    <li
                      key={`${tag}-${index}`}
                      className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-900"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Missing information */}
            {(Array.isArray(recipe.missing_information)
              ? recipe.missing_information.length > 0
              : Boolean(recipe.missing_information)) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-950">
                  Missing Recipe Information
                </h3>

                {Array.isArray(recipe.missing_information) ? (
                  <ul className="mt-2 list-disc pl-6 text-sm text-amber-950">
                    {recipe.missing_information.map(
                      (item, index) => (
                        <li key={index}>{item}</li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-amber-950">
                    {recipe.missing_information}
                  </p>
                )}
              </div>
            )}

            {/* Transcription evidence */}
            {transcript && (
              <details className="rounded-lg border border-neutral-300 p-4">
                <summary className="cursor-pointer font-medium">
                  View Panoscribe Transcript
                </summary>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {transcript}
                </p>
              </details>
            )}

            {ocrCandidates.length > 0 && (
              <details className="rounded-lg border border-neutral-300 p-4">
                <summary className="cursor-pointer font-medium">
                  View on-screen text (OCR)
                </summary>

                <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                  {ocrCandidates.map((candidate, index) => (
                    <li key={`${candidate.time}-${index}`}>
                      <span className="mr-2 text-neutral-500">
                        {candidate.time}s
                      </span>
                      {candidate.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="text-sm text-neutral-600">
              AI-generated recipes may contain mistakes.
              Verify ingredients, measurements, temperatures,
              and cooking instructions before use.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}

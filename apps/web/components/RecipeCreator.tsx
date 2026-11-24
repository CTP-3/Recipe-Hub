

"use client";

import { useEffect, useId, useState } from "react";
import { signInToSaveGeneratedRecipe } from "../app/auth-actions";
import { demoRecipes } from "../lib/demo-recipes";
import { PENDING_RECIPE_KEY } from "../lib/saved-recipes";
import { parseVideoUrl } from "@project/domain/video-url";
import SaveGeneratedRecipeButton from "./SaveGeneratedRecipeButton";
import RecipeCoverImage from "./RecipeCoverImage";
import VideoExtractionDetails from "./VideoExtractionDetails";
import OriginalVideoAttribution from "./OriginalVideoAttribution";

type Ingredient = string | {
  name?: string;
  item?: string;
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

export type Recipe = {
  title: string;
  description?: string | null;
  servings?: string | number | null;
  prep_time?: string | null;
  cook_time?: string | null;
  temperature?: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tips?: string[];
  equipment?: string[];
  dietary_tags?: string[];
  missing_information?: string[] | string | null;
};

export type OcrCandidate = {
  time: number;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasKnownValue(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "unknown" && normalized !== "not specified");
}

function isIngredient(value: unknown): value is Ingredient {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;

  return (
    ((typeof value.name === "string" && value.name.trim().length > 0) ||
      (typeof value.item === "string" && value.item.trim().length > 0)) &&
    (value.quantity === undefined ||
      value.quantity === null ||
      (typeof value.quantity === "string" && value.quantity.trim().length > 0) ||
      (typeof value.quantity === "number" &&
        Number.isFinite(value.quantity) &&
        value.quantity >= 0)) &&
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

const MAX_SIZE = 25 * 1024 * 1024;
const JOB_POLL_INTERVAL_MS = 2_000;
const JOB_MAX_POLL_FAILURES = 5;
const JOB_MAX_WAIT_MS = 20 * 60 * 1_000;

type JobRecipe = {
  id: string;
  title: string;
  recipe: Recipe;
  transcript: string;
  ocrCandidates: OcrCandidate[];
  model: string;
  coverImageUrl: string | null;
  visibility?: string;
};

type JobStatus = "queued" | "processing" | "ready" | "failed";
type SourceAttribution = {
  sourcePlatform: string | null;
  sourceVideoUrl: string | null;
  sourceCreatorUsername: string | null;
  sourceCreatorName: string | null;
  sourceCreatorProfileUrl: string | null;
};

function readSourceAttribution(value: Record<string, unknown>): SourceAttribution {
  return {
    sourcePlatform:
      typeof value.sourcePlatform === "string" ? value.sourcePlatform : null,
    sourceVideoUrl:
      typeof value.sourceVideoUrl === "string" ? value.sourceVideoUrl : null,
    sourceCreatorUsername:
      typeof value.sourceCreatorUsername === "string"
        ? value.sourceCreatorUsername
        : null,
    sourceCreatorName:
      typeof value.sourceCreatorName === "string" ? value.sourceCreatorName : null,
    sourceCreatorProfileUrl:
      typeof value.sourceCreatorProfileUrl === "string"
        ? value.sourceCreatorProfileUrl
        : null,
  };
}

function isJobStatus(value: unknown): value is JobStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  );
}

function isJobRecipe(value: unknown): value is JobRecipe {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecipe(value.recipe) &&
    typeof value.transcript === "string" &&
    typeof value.model === "string" &&
    (value.coverImageUrl === null || typeof value.coverImageUrl === "string") &&
    Array.isArray(value.ocrCandidates) &&
    value.ocrCandidates.every(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.time === "number" &&
        typeof candidate.text === "string",
    )
  );
}

function jobError(value: unknown): string {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  if (isRecord(value) && typeof value.error === "string") return value.error;
  return "Recipe extraction failed. Please try again.";
}

export default function RecipeCreator() {
  const inputId = useId();

  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [generatedRecipeId, setGeneratedRecipeId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [ocrCandidates, setOcrCandidates] = useState<OcrCandidate[]>([]);
  const [model, setModel] = useState("");
  const [sourceVideo, setSourceVideo] = useState<string | null>(null);
  const [sourceAccessToken, setSourceAccessToken] = useState<string | null>(null);
  const [sourceAttribution, setSourceAttribution] = useState<SourceAttribution>({
    sourcePlatform: null,
    sourceVideoUrl: null,
    sourceCreatorUsername: null,
    sourceCreatorName: null,
    sourceCreatorProfileUrl: null,
  });
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"LINK" | "UPLOAD" | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Release the previous preview URL when it changes.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("resumeSave") !== "1") return;

    const draft = sessionStorage.getItem(PENDING_RECIPE_KEY);
    if (!draft) return;

    try {
      const value: unknown = JSON.parse(draft);
      if (
        !isRecord(value) ||
        !isRecipe(value.recipe) ||
        (value.transcript !== undefined && typeof value.transcript !== "string") ||
        (value.ocrCandidates !== undefined &&
          (!Array.isArray(value.ocrCandidates) ||
            !value.ocrCandidates.every(
              (candidate) =>
                isRecord(candidate) &&
                typeof candidate.time === "number" &&
                typeof candidate.text === "string",
            ))) ||
        (value.model !== undefined && typeof value.model !== "string") ||
        (value.sourceVideo !== undefined &&
          value.sourceVideo !== null &&
          typeof value.sourceVideo !== "string") ||
        (value.generatedRecipeId !== undefined &&
          value.generatedRecipeId !== null &&
          typeof value.generatedRecipeId !== "string") ||
        (value.accessToken !== undefined &&
          value.accessToken !== null &&
          typeof value.accessToken !== "string") ||
        (value.coverImageUrl !== undefined &&
          value.coverImageUrl !== null &&
          typeof value.coverImageUrl !== "string") ||
        (value.sourceType !== undefined &&
          value.sourceType !== null &&
          value.sourceType !== "LINK" &&
          value.sourceType !== "UPLOAD")
      ) {
        throw new Error("The recipe saved before sign-in could not be restored.");
      }

      setRecipe(value.recipe);
      setGeneratedRecipeId(
        typeof value.generatedRecipeId === "string"
          ? value.generatedRecipeId
          : null,
      );
      setTranscript(value.transcript ?? "");
      setOcrCandidates(value.ocrCandidates ?? []);
      setModel(value.model ?? "");
      setSourceVideo(value.sourceVideo ?? null);
      setSourceAccessToken(
        typeof value.accessToken === "string" ? value.accessToken : null,
      );
      setCoverImageUrl(
        typeof value.coverImageUrl === "string" ? value.coverImageUrl : null,
      );
      setSourceType(value.sourceType ?? null);
      setSourceAttribution(
        isRecord(value.sourceAttribution)
          ? readSourceAttribution(value.sourceAttribution)
          : {
              sourcePlatform: null,
              sourceVideoUrl: null,
              sourceCreatorUsername: null,
              sourceCreatorName: null,
              sourceCreatorProfileUrl: null,
            },
      );
      setMessage("Your recipe is ready to save to your account.");
      sessionStorage.removeItem(PENDING_RECIPE_KEY);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The recipe saved before sign-in could not be restored.",
      );
    }
  }, []);

  function handleUpload(file?: File) {
    if (loading) return;

    setError("");
    setMessage("");
    setRecipe(null);
    setGeneratedRecipeId(null);
    setTranscript("");
    setOcrCandidates([]);
    setModel("");
    setSourceVideo(null);
    setSourceAccessToken(null);
    setCoverImageUrl(null);
    setSourceType(null);
    setSourceAttribution({
      sourcePlatform: null,
      sourceVideoUrl: null,
      sourceCreatorUsername: null,
      sourceCreatorName: null,
      sourceCreatorProfileUrl: null,
    });
    setVisibility("private");
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
    setSourceVideo(file.name);
    setPreview(URL.createObjectURL(file));
    setMessage(`${file.name} is ready to process.`);
  }

  async function waitForJob(response: Response) {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error("Recipe service returned an invalid response.");
    }
    if (!response.ok) throw new Error(jobError(value));
    if (
      !isRecord(value) ||
      typeof value.sourceId !== "string" ||
      !isJobStatus(value.status) ||
      typeof value.accessToken !== "string" ||
      (value.recipe !== null && !isJobRecipe(value.recipe))
    ) {
      throw new Error("Recipe service returned an invalid job.");
    }

    const sourceId = value.sourceId;
    const accessToken = value.accessToken;
    setSourceAttribution(readSourceAttribution(value));
    setGeneratedRecipeId(null);
    setSourceAccessToken(accessToken);

    let job = value;
    const deadline = Date.now() + JOB_MAX_WAIT_MS;
    let pollFailures = 0;
    while (job.status !== "ready") {
      if (job.status === "failed") {
        setRetryAvailable(true);
        throw new Error(
          isRecord(job) && typeof job.error === "string"
            ? job.error
            : "Recipe extraction failed. Please try again.",
        );
      }
      if (Date.now() >= deadline) {
        setRetryAvailable(true);
        throw new Error("Recipe extraction is taking too long. You can retry it.");
      }
      setMessage(
        job.status === "processing"
          ? "Transcribing and generating your recipe..."
          : "Your recipe is queued for processing...",
      );
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));

      // A brief network or server hiccup does not mean the job failed.
      let statusResponse: Response;
      try {
        statusResponse = await fetch(
          `/api/recipes/jobs/${encodeURIComponent(sourceId)}`,
          {
            cache: "no-store",
            headers: { "x-recipe-access-token": accessToken },
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (statusResponse.status >= 500) throw new Error("Status unavailable.");
      } catch {
        pollFailures += 1;
        if (pollFailures >= JOB_MAX_POLL_FAILURES) {
          setRetryAvailable(true);
          throw new Error(
            "Recipe Hub stopped responding. Check that it is running, then retry.",
          );
        }
        continue;
      }
      pollFailures = 0;
      let next: unknown;
      try {
        next = await statusResponse.json();
      } catch {
        throw new Error("Recipe service returned an invalid job status.");
      }
      if (!statusResponse.ok) throw new Error(jobError(next));
      if (
        !isRecord(next) ||
        !isJobStatus(next.status) ||
        (next.recipe !== null && !isJobRecipe(next.recipe))
      ) {
        throw new Error("Recipe service returned an invalid job status.");
      }
      job = next;
      setSourceAttribution(readSourceAttribution(next));
    }

    if (!isRecord(job) || !isJobRecipe(job.recipe)) {
      throw new Error("Recipe extraction completed without a recipe.");
    }
    const generated = job.recipe;
    setRecipe(generated.recipe);
    setGeneratedRecipeId(generated.id);
    setTranscript(generated.transcript);
    setOcrCandidates(generated.ocrCandidates);
    setModel(generated.model);
    setCoverImageUrl(generated.coverImageUrl);
    setVisibility(
      generated.visibility === "public" ? "public" : "private",
    );
    setMessage("Recipe generated successfully!");
  }

  async function handleGenerate() {
    if (!video || loading) {
      if (!video) setError("Please select a video first.");
      return;
    }

    setLoading(true);
    setRetryAvailable(false);
    setSourceVideo(video?.name ?? null);
    setError("");
    setRecipe(null);
    setGeneratedRecipeId(null);
    setTranscript("");
    setOcrCandidates([]);
    setMessage(
      "Uploading your video and queueing recipe extraction..."
    );
    setSourceType("UPLOAD");
    setSourceAttribution({
      sourcePlatform: null,
      sourceVideoUrl: null,
      sourceCreatorUsername: null,
      sourceCreatorName: null,
      sourceCreatorProfileUrl: null,
    });

    try {
      const formData = new FormData();
      formData.append("video", video);
      if (sourceAccessToken) {
        formData.append("accessToken", sourceAccessToken);
      }
      const response = await fetch("/api/recipes/jobs", {
        method: "POST",
        body: formData,
      });
      await waitForJob(response);
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

  async function handleGenerateFromUrl() {
    if (!videoUrl.trim() || loading) {
      if (!videoUrl.trim()) setError("Please enter a video link first.");
      return;
    }
    if (parseVideoUrl(videoUrl.trim())?.platform !== "tiktok") {
      setError("Enter a TikTok video link.");
      return;
    }

    setLoading(true);
    setRetryAvailable(false);
    setSourceVideo(videoUrl.trim());
    setError("");
    setRecipe(null);
    setGeneratedRecipeId(null);
    setTranscript("");
    setOcrCandidates([]);
    setModel("");
    setSourceType("LINK");
    setSourceAttribution({
      sourcePlatform: null,
      sourceVideoUrl: null,
      sourceCreatorUsername: null,
      sourceCreatorName: null,
      sourceCreatorProfileUrl: null,
    });
    setVisibility("private");
    setMessage("Checking for an existing recipe...");

    try {
      const response = await fetch("/api/recipes/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: videoUrl.trim(),
          ...(sourceVideo === videoUrl.trim() && sourceAccessToken
            ? { accessToken: sourceAccessToken }
            : {}),
        }),
      });
      await waitForJob(response);
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

    if (
      item.quantity === undefined ||
      item.quantity === null ||
      (typeof item.quantity === "string" && !item.quantity.trim())
    ) {
      return "";
    }

    return [
      typeof item.quantity === "string" ? item.quantity.trim() : item.quantity,
      item.unit,
    ]
      .filter((part) => part !== null && part !== undefined && part !== "")
      .join(" ");
  }

  function ingredientName(item: Exclude<Ingredient, string>): string {
    return item.name ?? item.item ?? "Ingredient";
  }

  function formatInstruction(item: Instruction): string {
    return typeof item === "string"
      ? item
      : item.instruction ?? "";
  }

  async function togglePublication() {
    if (!generatedRecipeId || sourceType !== "LINK" || publishing) return;
    setPublishing(true);
    setPublishMessage("");
    try {
      const response = await fetch(
        `/api/recipes/published/${encodeURIComponent(generatedRecipeId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published: visibility !== "public" }),
        },
      );
      if (response.status === 401) {
        sessionStorage.setItem(
          PENDING_RECIPE_KEY,
          JSON.stringify({
            recipe,
            transcript,
            ocrCandidates,
            model,
            sourceVideo,
            generatedRecipeId,
            accessToken: sourceAccessToken,
            coverImageUrl,
            sourceType,
            sourceAttribution,
          }),
        );
        await signInToSaveGeneratedRecipe();
        return;
      }
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Save this recipe to your account before publishing it."
            : "Unable to update Explore publication.",
        );
      }
      setVisibility(visibility === "public" ? "private" : "public");
      setPublishMessage(
        visibility === "public"
          ? "Recipe removed from Explore."
          : "Recipe published to Explore.",
      );
    } catch (caught) {
      setPublishMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to update Explore publication.",
      );
    } finally {
      setPublishing(false);
    }
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
          Paste a cooking video link to find or generate a recipe. Video uploads
          are available as a secondary option.
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
          Paste a video link
        </h2>

        <label htmlFor={`${inputId}-url`} className="mb-2 block font-medium">
          TikTok video link
        </label>
        <input
          id={`${inputId}-url`}
          type="url"
          value={videoUrl}
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : `${inputId}-url-help`}
          onChange={(event) => setVideoUrl(event.target.value)}
          placeholder="TikTok URL"
          className="block w-full rounded-lg border border-neutral-500 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:opacity-50"
        />
        <p id={`${inputId}-url-help`} className="mt-2 text-sm text-neutral-600">
          TikTok video and share links are supported. Existing recipes are
          checked before extraction starts.
        </p>
        <button
          type="button"
          onClick={handleGenerateFromUrl}
          disabled={!videoUrl.trim() || loading}
          className="mt-4 min-h-11 w-full rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Processing Video..."
            : retryAvailable
              ? "Retry Recipe Generation"
              : "Find or Generate Recipe"}
        </button>

        <details className="mt-6 border-t border-neutral-300 pt-5">
          <summary className="cursor-pointer font-semibold">
            Or upload a video file
          </summary>
          <div className="mt-4">
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
          </div>
        </details>

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
        aria-label="Generated recipe"
        className="mt-8 rounded-xl border border-neutral-400 bg-white p-6 shadow-sm"
      >
          {!recipe ? (
            <p className="text-neutral-700">
              Your extracted recipe will appear here after
              processing your video.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            <RecipeCoverImage
              src={coverImageUrl}
              alt={`Cover image for ${recipe.title}`}
              className="aspect-video w-full rounded-2xl object-cover"
            />
            <div>
              <h3 className="text-3xl font-bold text-green-950">
                {recipe.title || "Untitled Recipe"}
              </h3>

              {recipe.description && (
                <p className="mt-2 text-neutral-700">
                  {recipe.description}
                </p>
              )}
              {sourceType === "LINK" && (
                <OriginalVideoAttribution
                  platform={sourceAttribution.sourcePlatform}
                  videoUrl={sourceAttribution.sourceVideoUrl ?? sourceVideo}
                  creatorUsername={sourceAttribution.sourceCreatorUsername}
                  creatorName={sourceAttribution.sourceCreatorName}
                  creatorProfileUrl={sourceAttribution.sourceCreatorProfileUrl}
                />
              )}

              {model && (
                <p className="mt-2 text-xs text-neutral-500">
                  Generated using {model}
                </p>
              )}
            </div>

            {(hasKnownValue(recipe.servings) ||
              hasKnownValue(recipe.prep_time) ||
              hasKnownValue(recipe.cook_time) ||
              hasKnownValue(recipe.temperature)) && (
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-stone-200 py-4 text-sm text-stone-700">
                {hasKnownValue(recipe.servings) && (
                  <p><strong>Servings:</strong> {recipe.servings}</p>
                )}
                {hasKnownValue(recipe.prep_time) && (
                  <p><strong>Prep time:</strong> {recipe.prep_time}</p>
                )}
                {hasKnownValue(recipe.cook_time) && (
                  <p><strong>Cook time:</strong> {recipe.cook_time}</p>
                )}
                {hasKnownValue(recipe.temperature) && (
                  <p><strong>Temperature:</strong> {recipe.temperature}</p>
                )}
              </div>
            )}

            <SaveGeneratedRecipeButton
              recipe={recipe}
              transcript={transcript}
              ocrCandidates={ocrCandidates}
              model={model}
              sourceVideo={sourceVideo}
              generatedRecipeId={generatedRecipeId}
              accessToken={sourceAccessToken}
              coverImageUrl={coverImageUrl}
              sourceType={sourceType}
              sourceAttribution={sourceAttribution}
            />
            {generatedRecipeId && sourceType === "LINK" && (
              <div>
                <button
                  type="button"
                  onClick={() => void togglePublication()}
                  disabled={publishing}
                  className="min-h-11 rounded-full border border-[#294d38] px-6 py-3 font-semibold text-[#294d38] disabled:opacity-60"
                >
                  {publishing
                    ? "Updating..."
                    : visibility === "public"
                      ? "Unpublish from Explore"
                      : "Publish to Explore"}
                </button>
                <p className="mt-2 text-sm text-stone-600">
                  Recipes stay private unless you choose to publish them.
                </p>
                {publishMessage && (
                  <p role="status" className="mt-2 text-sm text-stone-700">
                    {publishMessage}
                  </p>
                )}
              </div>
            )}

            <div>
              <h3 className="text-2xl font-bold text-green-950">
                Ingredients
              </h3>

              {recipe.ingredients?.length ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {recipe.ingredients.map((item, index) => {
                    const amount = formatIngredient(item);
                    const isEstimated =
                      typeof item !== "string" &&
                      item.estimated === true &&
                      Boolean(amount);

                    return (
                      <li
                        key={index}
                        className="rounded-xl border border-stone-200 bg-stone-50 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            aria-label={`Mark ${typeof item === "string" ? item : ingredientName(item)} as prepared`}
                            className="mt-1 h-5 w-5 shrink-0 accent-emerald-800"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-stone-900">
                              {typeof item === "string" ? item : ingredientName(item)}
                            </p>
                            <p className="mt-1 text-sm text-stone-700">
                              {isEstimated ? (
                                <>
                                  <span className="mr-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                    Estimated
                                  </span>
                                  {amount}
                                </>
                              ) : (
                                amount || "Quantity not specified"
                              )}
                            </p>
                            {typeof item !== "string" &&
                              (item.said || item.notes) && (
                                <details className="mt-3 border-t border-stone-200 pt-2">
                                  <summary className="cursor-pointer text-sm font-medium text-emerald-900">
                                    Ingredient details
                                  </summary>
                                  <div className="mt-2 space-y-2 text-sm text-stone-600">
                                    {item.said && <p>In the video: {item.said}</p>}
                                    {item.notes && <p>{item.notes}</p>}
                                  </div>
                                </details>
                              )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-neutral-600">
                  No ingredients identified.
                </p>
              )}
            </div>

            <div>
              <h3 className="text-2xl font-bold text-green-950">
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

            {recipe.tips?.length ? (
              <div>
                <h3 className="text-2xl font-bold text-green-950">Tips</h3>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  {recipe.tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {recipe.equipment?.length ? (
              <div>
                <h3 className="text-lg font-semibold">Equipment</h3>
                <ul className="mt-2 list-disc pl-6">
                  {recipe.equipment.map((item, index) => (
                    <li key={index}>{item}</li>
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

            <VideoExtractionDetails
              transcript={transcript}
              ocrCandidates={ocrCandidates}
            />

            <p className="border-t border-stone-200 pt-4 text-sm text-neutral-600">
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

"use client";

import { useEffect, useState } from "react";
import { signInToSaveGeneratedRecipe } from "../app/auth-actions";
import { PENDING_RECIPE_KEY } from "../lib/saved-recipes";
import type { OcrCandidate, Recipe } from "./RecipeCreator";

type Props = {
  recipe: Recipe;
  transcript: string;
  ocrCandidates: OcrCandidate[];
  model: string;
  sourceVideo: string | null;
  generatedRecipeId: string | null;
  accessToken: string | null;
  coverImageUrl: string | null;
  sourceType: "LINK" | "UPLOAD" | null;
  sourceAttribution?: {
    sourcePlatform: string | null;
    sourceVideoUrl: string | null;
    sourceCreatorUsername: string | null;
    sourceCreatorName: string | null;
    sourceCreatorProfileUrl: string | null;
  };
};

export default function SaveGeneratedRecipeButton(props: Props) {
  const [status, setStatus] = useState<
    "checking" | "ready" | "saving" | "removing" | "saved"
  >(props.generatedRecipeId ? "checking" : "ready");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!props.generatedRecipeId) {
      setStatus("ready");
      setSavedId(null);
      return;
    }

    let active = true;
    void fetch("/api/recipes/saved", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          if (active) setStatus("ready");
          return;
        }
        if (!response.ok) throw new Error("Unable to check your saved recipes.");
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("recipes" in result) ||
          !Array.isArray(result.recipes)
        ) {
          throw new Error("The server returned an invalid saved recipe list.");
        }
        const savedRecipe = result.recipes.find(
          (item) =>
            item &&
            typeof item === "object" &&
            "recipeId" in item &&
            item.recipeId === props.generatedRecipeId &&
            "id" in item &&
            typeof item.id === "string",
        );
        if (!active) return;
        setSavedId(
          savedRecipe && typeof savedRecipe === "object" && "id" in savedRecipe
            ? String(savedRecipe.id)
            : null,
        );
        setStatus(savedRecipe ? "saved" : "ready");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setStatus("ready");
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to check your saved recipes.",
        );
      });

    return () => {
      active = false;
    };
  }, [props.generatedRecipeId]);

  async function toggleSaved() {
    if (status === "checking" || status === "saving" || status === "removing") return;
    setError("");
    setMessage("");

    if (status === "saved" && savedId) {
      setStatus("removing");
      try {
        const response = await fetch(
          `/api/recipes/saved/${encodeURIComponent(savedId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          throw new Error("Unable to remove this recipe from Saved.");
        }
        setSavedId(null);
        setStatus("ready");
        setMessage("Recipe removed from Saved.");
        window.dispatchEvent(new Event("recipe-hub:saved-changed"));
      } catch (caught) {
        setStatus("saved");
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to remove this recipe from Saved.",
        );
      }
      return;
    }

    setStatus("saving");

    const payload = {
      recipe: props.recipe,
      transcript: props.transcript,
      ocrCandidates: props.ocrCandidates,
      model: props.model,
      sourceVideo: props.sourceVideo,
      generatedRecipeId: props.generatedRecipeId,
      accessToken: props.accessToken,
      coverImageUrl: props.coverImageUrl,
      sourceType: props.sourceType,
      sourceAttribution: props.sourceAttribution ?? null,
    };

    try {
      const response = await fetch("/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          props.generatedRecipeId
            ? {
                generatedRecipeId: props.generatedRecipeId,
                accessToken: props.accessToken,
              }
            : payload,
        ),
      });

      if (response.status === 401) {
        sessionStorage.setItem(PENDING_RECIPE_KEY, JSON.stringify(payload));
        await signInToSaveGeneratedRecipe();
        return;
      }

      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error &&
          typeof result.error.message === "string"
            ? result.error.message
            : "Unable to save this recipe. Please try again.";
        throw new Error(message);
      }

      if (
        !result ||
        typeof result !== "object" ||
        !("savedRecipe" in result) ||
        !result.savedRecipe ||
        typeof result.savedRecipe !== "object" ||
        !("id" in result.savedRecipe) ||
        typeof result.savedRecipe.id !== "string"
      ) {
        throw new Error("The server returned an invalid saved recipe.");
      }

      setSavedId(result.savedRecipe.id);
      setStatus("saved");
      setMessage("Recipe saved to My Recipes.");
      window.dispatchEvent(new Event("recipe-hub:saved-changed"));
    } catch (caught) {
      setStatus("ready");
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save this recipe. Please try again.",
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void toggleSaved()}
        disabled={status === "checking" || status === "saving" || status === "removing"}
        aria-pressed={status === "saved"}
        className="min-h-11 rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white transition hover:bg-[#203d2c] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "checking"
          ? "Checking..."
          : status === "saving"
          ? "Saving..."
          : status === "removing"
            ? "Removing..."
            : status === "saved"
              ? "Remove from Saved"
              : "Save Recipe"}
      </button>
      {status === "saved" && savedId && (
        <a
          href={`/my-recipes/saved/${savedId}`}
          className="ml-3 text-sm font-semibold text-[#294d38] underline underline-offset-2"
        >
          View saved recipe
        </a>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-stone-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

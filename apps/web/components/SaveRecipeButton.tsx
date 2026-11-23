"use client";

import { useEffect, useState } from "react";
import { signInToSaveRecipe } from "../app/auth-actions";
import { demoRecipes } from "../lib/demo-recipes";
import { PENDING_BOOKMARK_KEY } from "../lib/saved-recipes";

export default function SaveRecipeButton({ id }: { id: string }) {
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/recipes/saved", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          result &&
          typeof result === "object" &&
          "recipes" in result &&
          Array.isArray(result.recipes) &&
          active
        ) {
          const bookmark = result.recipes.find(
            (recipe) =>
              recipe &&
              typeof recipe === "object" &&
              "recipeId" in recipe &&
              recipe.recipeId === id &&
              "id" in recipe &&
              typeof recipe.id === "string",
          );
          setSaved(Boolean(bookmark));
          setSavedId(
            bookmark && typeof bookmark === "object" && "id" in bookmark
              ? String(bookmark.id)
              : null,
          );
        }
      })
      .catch(() => {
        if (active) setError("Unable to check your saved recipes.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function toggleSaved() {
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      if (saved && savedId) {
        const response = await fetch(
          `/api/recipes/saved/${encodeURIComponent(savedId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) throw new Error("Unable to remove this bookmark.");
        setSaved(false);
        setSavedId(null);
        window.dispatchEvent(new Event("recipe-hub:saved-changed"));
        return;
      }
      const recipe = demoRecipes.find((item) => item.id === id);
      if (!recipe) {
        throw new Error("This recipe is no longer available.");
      }
      const payload = {
        recipe: {
          id: recipe.id,
          title: recipe.title,
          description: recipe.description,
          image: recipe.image,
          category: recipe.category,
          time: recipe.time,
          servings: recipe.servings,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
        },
      };
      const response = await fetch("/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        sessionStorage.setItem(PENDING_BOOKMARK_KEY, JSON.stringify(payload));
        await signInToSaveRecipe();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to save this recipe. Please try again.");
      }

      setSaved(true);
      const result: unknown = await response.json();
      if (
        result &&
        typeof result === "object" &&
        "savedRecipe" in result &&
        result.savedRecipe &&
        typeof result.savedRecipe === "object" &&
        "id" in result.savedRecipe &&
        typeof result.savedRecipe.id === "string"
      ) {
        setSavedId(result.savedRecipe.id);
      }
      window.dispatchEvent(new Event("recipe-hub:saved-changed"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save this recipe. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void toggleSaved()}
        disabled={saving}
        aria-pressed={saved}
        className="rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving..." : saved ? "♥ Saved recipe" : "♡ Save recipe"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

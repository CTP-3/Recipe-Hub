"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RecipeCreator from "../../components/RecipeCreator";
import RecipeCard from "../../components/RecipeCard";
import RecipeCoverImage from "../../components/RecipeCoverImage";
import { demoRecipes } from "../../lib/demo-recipes";
import {
  PENDING_BOOKMARK_KEY,
  readSaved,
  writeSaved,
} from "../../lib/saved-recipes";

type SavedRecipeSummary = {
  id: string;
  title: string;
  sourceVideo: string | null;
  createdAt: string;
  recipeId: string | null;
  image: string | null;
  category: string;
  sourcePlatform: string | null;
  sourceVideoUrl: string | null;
  sourceCreatorUsername: string | null;
  sourceCreatorName: string | null;
  sourceCreatorProfileUrl: string | null;
};

type CreatedRecipeSummary = {
  id: string;
  title: string;
  sourceVideo: string | null;
  createdAt: string;
  visibility: "private" | "public";
  image: string | null;
  sourceType: "LINK" | "UPLOAD";
};

function isCreatedRecipeSummary(value: unknown): value is CreatedRecipeSummary {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "sourceVideo" in value &&
    (typeof value.sourceVideo === "string" || value.sourceVideo === null) &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "visibility" in value &&
    (value.visibility === "private" || value.visibility === "public") &&
    "image" in value &&
    (typeof value.image === "string" || value.image === null) &&
    "sourceType" in value &&
    (value.sourceType === "LINK" || value.sourceType === "UPLOAD")
  );
}

function isSavedRecipeSummary(value: unknown): value is SavedRecipeSummary {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "sourceVideo" in value &&
    (typeof value.sourceVideo === "string" || value.sourceVideo === null) &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "recipeId" in value &&
    (typeof value.recipeId === "string" || value.recipeId === null) &&
    "image" in value &&
    (typeof value.image === "string" || value.image === null) &&
    "category" in value &&
    typeof value.category === "string" &&
    "sourcePlatform" in value &&
    (typeof value.sourcePlatform === "string" || value.sourcePlatform === null) &&
    "sourceVideoUrl" in value &&
    (typeof value.sourceVideoUrl === "string" || value.sourceVideoUrl === null) &&
    "sourceCreatorUsername" in value &&
    (typeof value.sourceCreatorUsername === "string" ||
      value.sourceCreatorUsername === null) &&
    "sourceCreatorName" in value &&
    (typeof value.sourceCreatorName === "string" || value.sourceCreatorName === null) &&
    "sourceCreatorProfileUrl" in value &&
    (typeof value.sourceCreatorProfileUrl === "string" ||
      value.sourceCreatorProfileUrl === null)
  );
}

export default function MyRecipesPage() {
  const [tab, setTab] = useState<"saved" | "created" | "create">("saved");
  const [ids, setIds] = useState<string[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipeSummary[]>([]);
  const [createdRecipes, setCreatedRecipes] = useState<CreatedRecipeSummary[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [loadingCreated, setLoadingCreated] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "create") {
      setTab("create");
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadCreatedRecipes() {
      setLoadingCreated(true);
      try {
        const response = await fetch("/api/recipes/created", { cache: "no-store" });
        if (response.status === 401) {
          if (active) setCreatedRecipes([]);
          return;
        }
        if (!response.ok) throw new Error("Unable to load created recipes.");
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("recipes" in result) ||
          !Array.isArray(result.recipes) ||
          !result.recipes.every(isCreatedRecipeSummary)
        ) {
          throw new Error("The server returned an invalid recipe collection.");
        }
        if (active) setCreatedRecipes(result.recipes);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load created recipes.",
          );
        }
      } finally {
        if (active) setLoadingCreated(false);
      }
    }
    void loadCreatedRecipes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("resumeBookmark") !== "1") {
      return;
    }
    const pending = sessionStorage.getItem(PENDING_BOOKMARK_KEY);
    if (!pending) return;

    void (async () => {
      try {
        const response = await fetch("/api/recipes/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: pending,
        });
        if (response.status === 401) {
          setSignedOut(true);
          setError("Sign in to save this recipe.");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to finish saving this recipe.");
        }
        sessionStorage.removeItem(PENDING_BOOKMARK_KEY);
        window.dispatchEvent(new Event("recipe-hub:saved-changed"));
        setTab("saved");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to finish saving this recipe.",
        );
      }
    })();
  }, []);

  useEffect(() => {
    const syncLocalSaved = () => setIds(readSaved());
    syncLocalSaved();
    window.addEventListener("recipe-hub:saved-changed", syncLocalSaved);
    return () =>
      window.removeEventListener("recipe-hub:saved-changed", syncLocalSaved);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSavedRecipes() {
      setLoadingSaved(true);
      setError("");
      try {
        const response = await fetch("/api/recipes/saved", {
          cache: "no-store",
        });
        if (response.status === 401) {
          if (active) {
            setSignedOut(true);
            setSavedRecipes([]);
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load your saved recipes.");
        }

        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("recipes" in result) ||
          !Array.isArray(result.recipes) ||
          !result.recipes.every(isSavedRecipeSummary)
        ) {
          throw new Error("The server returned an invalid recipe collection.");
        }

        if (active) {
          setSignedOut(false);
          setSavedRecipes(result.recipes);
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load your saved recipes.",
          );
        }
      } finally {
        if (active) setLoadingSaved(false);
      }
    }

    void loadSavedRecipes();
    const refresh = () => void loadSavedRecipes();
    window.addEventListener("recipe-hub:saved-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("recipe-hub:saved-changed", refresh);
    };
  }, []);

  async function removeRecipe(id: string) {
    if (removingId) return;
    setRemovingId(id);
    setError("");
    try {
      const response = await fetch(`/api/recipes/saved/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result: unknown = await response.json();
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error &&
          typeof result.error.message === "string"
            ? result.error.message
            : "Unable to remove this recipe.";
        throw new Error(message);
      }
      setSavedRecipes((current) => current.filter((recipe) => recipe.id !== id));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to remove this recipe.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  const localRecipes = demoRecipes.filter(
    (recipe) =>
      ids.includes(recipe.id) &&
      !savedRecipes.some((saved) => saved.recipeId === recipe.id),
  );
  const databaseRecipes = savedRecipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    image: recipe.image,
    category: recipe.category,
    sourcePlatform: recipe.sourcePlatform,
    sourceVideoUrl: recipe.sourceVideoUrl,
    sourceCreatorUsername: recipe.sourceCreatorUsername,
    sourceCreatorName: recipe.sourceCreatorName,
    sourceCreatorProfileUrl: recipe.sourceCreatorProfileUrl,
    href: `/my-recipes/saved/${encodeURIComponent(recipe.id)}`,
  }));
  async function togglePublication(recipe: CreatedRecipeSummary) {
    const published = recipe.visibility !== "public";
    try {
      const response = await fetch(
        `/api/recipes/published/${encodeURIComponent(recipe.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published }),
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Only your ready recipes from video links can be published."
            : "Unable to update publication.",
        );
      }
      setCreatedRecipes((current) =>
        current.map((item) =>
          item.id === recipe.id
            ? { ...item, visibility: published ? "public" : "private" }
            : item,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update publication.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 md:px-8">
      <p className="text-sm font-bold uppercase tracking-widest text-[#a86d47]">
        Your collection
      </p>
      <h1 className="mt-2 text-4xl font-black text-[#294d38]">My Recipes</h1>
      <p className="mt-3 text-stone-600">
        A home for the meals you love and create.
      </p>

      <div className="my-8 flex flex-wrap gap-2 border-b border-stone-200 pb-4">
        {(["saved", "created", "create"] as const).map((currentTab) => (
          <button
            key={currentTab}
            onClick={() => setTab(currentTab)}
            aria-pressed={tab === currentTab}
            className={`rounded-full px-6 py-3 font-semibold capitalize ${
              tab === currentTab
                ? "bg-[#294d38] text-white"
                : "bg-white text-stone-600"
            }`}
          >
            {currentTab.charAt(0).toUpperCase() + currentTab.slice(1)}
          </button>
        ))}
      </div>

      {tab === "saved" ? (
        <section aria-label="Saved recipes">
          {error && (
            <p role="alert" className="mb-4 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {loadingSaved ? (
            <p className="text-sm text-stone-600">Loading saved recipes...</p>
          ) : localRecipes.length || databaseRecipes.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {databaseRecipes.map((recipe) => (
                <article key={recipe.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <RecipeCard recipe={recipe} />
                  <button
                    type="button"
                    onClick={() => void removeRecipe(recipe.id)}
                    disabled={removingId !== null}
                    className="px-5 py-3 text-sm font-semibold text-red-700 underline underline-offset-2 disabled:opacity-50"
                  >
                    {removingId === recipe.id ? "Removing..." : "Remove bookmark"}
                  </button>
                </article>
              ))}
              {localRecipes.map((recipe) => (
                <article key={recipe.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <RecipeCard recipe={recipe} />
                  <button
                    type="button"
                    onClick={() => writeSaved(ids.filter((id) => id !== recipe.id))}
                    className="px-5 py-3 text-sm font-semibold text-red-700 underline underline-offset-2"
                  >
                    Remove bookmark
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl bg-white p-12 text-center">
              <div className="text-5xl">♡</div>
              <h2 className="mt-4 text-2xl font-bold text-[#294d38]">
                No bookmarked recipes yet
              </h2>
              <p className="mt-2 text-stone-600">
                Bookmark a recipe from discovery to keep it here.
              </p>
              <Link
                href="/home#discover-recipes"
                className="mt-5 inline-block rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white"
              >
                Explore recipes
              </Link>
            </div>
          )}
        </section>
      ) : tab === "created" ? (
        <section aria-label="Created recipes">
          {error && (
            <p role="alert" className="mb-4 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {loadingCreated ? (
            <p className="text-sm text-stone-600">Loading created recipes...</p>
          ) : createdRecipes.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {createdRecipes.map((recipe) => (
                <article
                  key={recipe.id}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm"
                >
                  <Link
                    href={`/recipes/${encodeURIComponent(recipe.id)}`}
                    className="block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                  >
                    <RecipeCoverImage
                      src={recipe.image}
                      alt={`Cover image for ${recipe.title}`}
                      className="mb-4 aspect-video w-full rounded-xl object-cover"
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Created from video
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-green-950">
                      {recipe.title}
                    </h2>
                    {recipe.sourceVideo && (
                      <p className="mt-2 truncate text-sm text-stone-600">
                        Source: {recipe.sourceVideo}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-stone-500">
                      Saved {new Date(recipe.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                  <div className="border-t border-stone-100 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => void togglePublication(recipe)}
                      className="text-sm font-semibold text-emerald-900 underline underline-offset-2"
                    >
                      {recipe.visibility === "public" ? "Unpublish from Explore" : "Publish to Explore"}
                    </button>
                    {recipe.sourceType === "UPLOAD" && (
                      <p className="mt-2 text-xs text-stone-500">
                        Uploaded videos stay private and cannot be published.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl bg-white p-12 text-center">
              <div className="text-5xl">✦</div>
              <h2 className="mt-4 text-2xl font-bold text-[#294d38]">
                No created recipes yet
              </h2>
              <p className="mt-2 text-stone-600">
                Save a generated recipe to keep it in your collection.
                {signedOut && " Sign in to view recipes saved to your account."}
              </p>
              <button
                onClick={() => setTab("create")}
                className="mt-5 rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white"
              >
                Create a recipe
              </button>
            </div>
          )}
        </section>
      ) : (
        <RecipeCreator />
      )}
    </main>
  );
}

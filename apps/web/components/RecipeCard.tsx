"use client";

import Link from "next/link";
import OriginalVideoAttribution from "./OriginalVideoAttribution";
import RecipeCoverImage from "./RecipeCoverImage";

type RecipeCardProps = {
  recipe: {
    id: string;
    title: string;
    image: string | null;
    description?: string;
    category?: string;
    href?: string;
    sourcePlatform?: string | null;
    sourceVideoUrl?: string | null;
    sourceCreatorUsername?: string | null;
    sourceCreatorName?: string | null;
    sourceCreatorProfileUrl?: string | null;
  };
};

export default function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl bg-green-50 shadow-sm transition hover:shadow-lg">
      <Link
        href={recipe.href ?? `/recipes/${recipe.id}`}
        className="group block focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        <div className="overflow-hidden">
          <RecipeCoverImage
            src={recipe.image}
            alt={`Cover image for ${recipe.title}`}
            className="h-56 w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>

        <div className="p-4">
          {recipe.category && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {recipe.category}
            </p>
          )}

          <h3 className="text-lg font-bold text-green-900">{recipe.title}</h3>

          {recipe.description && (
            <p className="mt-2 line-clamp-2 text-sm text-stone-600">
              {recipe.description}
            </p>
          )}
        </div>
      </Link>
      {recipe.sourcePlatform && (
        <OriginalVideoAttribution
          compact
          platform={recipe.sourcePlatform}
          videoUrl={recipe.sourceVideoUrl ?? null}
          creatorUsername={recipe.sourceCreatorUsername ?? null}
          creatorName={recipe.sourceCreatorName ?? null}
          creatorProfileUrl={recipe.sourceCreatorProfileUrl ?? null}
        />
      )}
    </article>
  );
}
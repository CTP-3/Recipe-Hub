"use client";

import Link from "next/link";

type RecipeCardProps = {
  recipe: {
    id: string;
    title: string;
    image: string;
    description?: string;
    category?: string;
  };
};

export default function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group block overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-lg"
    >
      <div className="overflow-hidden">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="h-56 w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </div>

      <div className="p-4">
        {recipe.category && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {recipe.category}
          </p>
        )}

        <h3 className="text-lg font-bold text-stone-900">
          {recipe.title}
        </h3>

        {recipe.description && (
          <p className="mt-2 line-clamp-2 text-sm text-stone-600">
            {recipe.description}
          </p>
        )}
      </div>
    </Link>
  );
}
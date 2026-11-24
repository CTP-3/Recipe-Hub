'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import RecipeCard from '../../components/RecipeCard';
import { demoRecipes } from '../../lib/demo-recipes';

const categories = ['All', 'Video recipe', 'Breakfast', 'Lunch', 'Dinner', 'Dessert'];

type PublishedRecipeSummary = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  category: string;
  sourcePlatform: string | null;
  sourceVideoUrl: string | null;
  sourceCreatorUsername: string | null;
  sourceCreatorName: string | null;
  sourceCreatorProfileUrl: string | null;
};

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [publishedRecipes, setPublishedRecipes] = useState<PublishedRecipeSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingPublished, setLoadingPublished] = useState(true);
  const [publishedError, setPublishedError] = useState('');

  async function loadPublishedRecipes(cursor?: string) {
    setLoadingPublished(true);
    setPublishedError('');
    try {
      const query = new URLSearchParams({ limit: '12' });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/api/recipes/published?${query}`, {
        cache: 'no-store',
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error('Unable to load published recipes.');
      if (
        !result ||
        typeof result !== 'object' ||
        !('recipes' in result) ||
        !Array.isArray(result.recipes) ||
        !('nextCursor' in result) ||
        (result.nextCursor !== null && typeof result.nextCursor !== 'string')
      ) {
        throw new Error('Explore returned an invalid recipe list.');
      }
      const recipes = result.recipes.filter(
        (recipe): recipe is PublishedRecipeSummary =>
          Boolean(recipe) &&
          typeof recipe === 'object' &&
          'id' in recipe &&
          typeof recipe.id === 'string' &&
          'title' in recipe &&
          typeof recipe.title === 'string' &&
          'description' in recipe &&
          typeof recipe.description === 'string' &&
          'image' in recipe &&
          (typeof recipe.image === 'string' || recipe.image === null) &&
          'category' in recipe &&
          typeof recipe.category === 'string' &&
          'sourcePlatform' in recipe &&
          (typeof recipe.sourcePlatform === 'string' ||
            recipe.sourcePlatform === null) &&
          'sourceVideoUrl' in recipe &&
          (typeof recipe.sourceVideoUrl === 'string' ||
            recipe.sourceVideoUrl === null) &&
          'sourceCreatorUsername' in recipe &&
          (typeof recipe.sourceCreatorUsername === 'string' ||
            recipe.sourceCreatorUsername === null) &&
          'sourceCreatorName' in recipe &&
          (typeof recipe.sourceCreatorName === 'string' ||
            recipe.sourceCreatorName === null) &&
          'sourceCreatorProfileUrl' in recipe &&
          (typeof recipe.sourceCreatorProfileUrl === 'string' ||
            recipe.sourceCreatorProfileUrl === null),
      );
      if (recipes.length !== result.recipes.length) {
        throw new Error('Explore returned an invalid recipe list.');
      }
      setPublishedRecipes((current) =>
        cursor ? [...current, ...recipes] : recipes,
      );
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setPublishedError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load published recipes.',
      );
    } finally {
      setLoadingPublished(false);
    }
  }

  useEffect(() => {
    void loadPublishedRecipes();
  }, []);

  const visibleRecipes = useMemo(
    () =>
      demoRecipes.filter(
        (recipe) =>
          (category === 'All' || recipe.category === category) &&
          `${recipe.title} ${recipe.description} ${recipe.ingredients.join(' ')}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [search, category],
  );
  const visiblePublished = useMemo(
    () =>
      publishedRecipes.filter(
        (recipe) =>
          (category === 'All' || category === 'Video recipe') &&
          `${recipe.title} ${recipe.description} ${recipe.sourcePlatform ?? ''} ${recipe.sourceCreatorUsername ?? ''} ${recipe.sourceCreatorName ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [publishedRecipes, search, category],
  );

  return (
    <main className="mx-auto max-w-7xl space-y-12 px-5 py-10 md:px-8">
      <section className="grid gap-8 overflow-hidden rounded-[2rem] bg-green-50 md:grid-cols-2 md:p-14">
        <div className="flex flex-col justify-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-[#8b6344]">
            Your kitchen, organized
          </p>
          <h1 className="max-w-lg text-4xl font-black leading-tight text-[#294d38] md:text-6xl">
            Good food starts with a little inspiration.
          </h1>
          <p className="mt-5 max-w-md text-stone-700">
            Turn cooking videos into recipes, save your favorites, and find your
            next meal.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/my-recipes?tab=create"
              className="rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white hover:bg-[#1b3526]"
            >
              + Create a recipe
            </Link>
            <Link
              href="#discover-recipes"
              className="rounded-full border border-[#294d38] px-6 py-3 font-semibold text-[#294d38] hover:bg-white/50"
            >
              Explore recipes
            </Link>
          </div>
        </div>
        <img
          src={demoRecipes[0].image}
          alt="Salmon dish"
          className="h-72 w-full rounded-[1.5rem] object-cover md:h-full"
        />
      </section>

      <section id="discover-recipes" className="scroll-mt-8">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-widest text-[#a86d47]">
            Find your next favorite
          </p>
          <h2 className="mt-2 text-4xl font-black text-[#294d38] md:text-5xl">
            Discover recipes
          </h2>
          <p className="mt-3 text-stone-600">
            Browse, get inspired, and save what looks good.
          </p>
        </div>

        <label htmlFor="recipe-search" className="sr-only">
          Search recipes
        </label>
        <input
          id="recipe-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recipes or ingredients..."
          className="mb-5 w-full rounded-2xl border border-stone-300 bg-white px-5 py-4 outline-none focus:border-[#294d38]"
        />

        <div className="mb-8 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={`rounded-full px-5 py-2 text-sm font-semibold ${
                category === item
                  ? 'bg-[#294d38] text-white'
                  : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {publishedError && (
          <div className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <p role="alert">{publishedError}</p>
            <button
              type="button"
              onClick={() => void loadPublishedRecipes()}
              className="mt-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {visiblePublished.length > 0 && (
          <section aria-label="Published video recipes" className="mb-10">
            <h3 className="mb-4 text-xl font-bold text-[#294d38]">
              Published video recipes
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {visiblePublished.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={{
                    ...recipe,
                    image: recipe.image,
                  }}
                />
              ))}
            </div>
            {nextCursor && (
              <button
                type="button"
                disabled={loadingPublished}
                onClick={() => void loadPublishedRecipes(nextCursor)}
                className="mt-6 rounded-full border border-[#294d38] px-5 py-3 font-semibold text-[#294d38] disabled:opacity-50"
              >
                {loadingPublished ? 'Loading...' : 'Load more video recipes'}
              </button>
            )}
          </section>
        )}

        <section aria-label="Demo recipes">
          <h3 className="mb-4 text-xl font-bold text-[#294d38]">
            Recipe Hub demos
          </h3>
          {visibleRecipes.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {visibleRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-white p-8 text-center text-stone-500">
              No demo recipes match your search.
            </p>
          )}
        </section>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-7">
        <h2 className="text-2xl font-bold text-[#294d38]">Your cookbook</h2>
        <p className="mt-2 text-stone-600">
          Keep everything you create and save in one place.
        </p>
        <Link
          href="/my-recipes"
          className="mt-4 inline-block rounded-full bg-[#294d38] px-5 py-3 font-semibold text-white"
        >
          Open My Recipes
        </Link>
      </section>
    </main>
  );
}

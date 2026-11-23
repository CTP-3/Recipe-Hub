import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUserId } from "@project/auth";
import VideoExtractionDetails from "../../../../components/VideoExtractionDetails";
import OriginalVideoAttribution from "../../../../components/OriginalVideoAttribution";
import RecipeCoverImage from "../../../../components/RecipeCoverImage";
import {
  getSavedRecipeForUser,
  savedRecipePayloadSchema,
} from "@project/domain";

export const dynamic = "force-dynamic";

function hasKnownValue(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "unknown" && normalized !== "not specified");
}

export default async function SavedRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) notFound();

  const { id } = await params;
  const saved = await getSavedRecipeForUser(userId, id);
  if (!saved) notFound();

  const payload = savedRecipePayloadSchema.safeParse(
    saved.generatedRecipe
      ? {
          recipe: saved.generatedRecipe.recipe,
          transcript: saved.generatedRecipe.transcript ?? "",
          ocrCandidates: saved.generatedRecipe.ocrCandidates ?? [],
          model: saved.generatedRecipe.model ?? "",
          sourceVideo: saved.sourceVideo,
        }
      : saved.recipe,
  );
  if (!payload.success) notFound();

  const { recipe, transcript, ocrCandidates } = payload.data;
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 md:px-8">
      <Link
        href="/my-recipes"
        className="font-semibold text-[#294d38] underline underline-offset-2"
      >
        ← Back to My Recipes
      </Link>

      <article className="mt-7 rounded-3xl bg-white p-6 shadow-sm md:p-10">
        <header>
          {saved.generatedRecipe && (
            <RecipeCoverImage
              src={
                saved.generatedRecipe.coverImageKey
                  ? `/api/recipes/media/${saved.generatedRecipe.id}`
                  : null
              }
              alt={`Cover image for ${recipe.title}`}
              className="mb-6 aspect-video w-full rounded-2xl object-cover"
            />
          )}
          <h1 className="text-4xl font-black text-[#294d38]">{recipe.title}</h1>
          {recipe.description && (
            <p className="mt-3 text-lg text-stone-600">{recipe.description}</p>
          )}
          {saved.generatedRecipe && (
            <OriginalVideoAttribution
              platform={
                saved.generatedRecipe.videoSource.sourcePlatform ??
                saved.generatedRecipe.videoSource.platform
              }
              videoUrl={
                saved.generatedRecipe.videoSource.sourceVideoUrl ??
                saved.generatedRecipe.videoSource.canonicalUrl ??
                saved.sourceVideo
              }
              creatorUsername={
                saved.generatedRecipe.videoSource.sourceCreatorUsername
              }
              creatorName={saved.generatedRecipe.videoSource.sourceCreatorName}
              creatorProfileUrl={
                saved.generatedRecipe.videoSource.sourceCreatorProfileUrl
              }
              recipeHubContributor={
                saved.generatedRecipe.owner?.username ??
                saved.generatedRecipe.owner?.name ??
                null
              }
            />
          )}
          {saved.sourceVideo && !saved.generatedRecipe && (
            <p className="mt-3 break-all text-sm text-stone-500">
              Source video: {saved.sourceVideo}
            </p>
          )}
          {(hasKnownValue(recipe.servings) ||
            hasKnownValue(recipe.prep_time) ||
            hasKnownValue(recipe.cook_time) ||
            hasKnownValue(recipe.temperature)) && (
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-stone-200 py-4 text-sm text-stone-700">
              {hasKnownValue(recipe.servings) && (
                <div><dt className="inline font-semibold">Servings: </dt><dd className="inline">{recipe.servings}</dd></div>
              )}
              {hasKnownValue(recipe.prep_time) && (
                <div><dt className="inline font-semibold">Prep time: </dt><dd className="inline">{recipe.prep_time}</dd></div>
              )}
              {hasKnownValue(recipe.cook_time) && (
                <div><dt className="inline font-semibold">Cook time: </dt><dd className="inline">{recipe.cook_time}</dd></div>
              )}
              {hasKnownValue(recipe.temperature) && (
                <div><dt className="inline font-semibold">Temperature: </dt><dd className="inline">{recipe.temperature}</dd></div>
              )}
            </dl>
          )}
        </header>

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#294d38]">Ingredients</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {recipe.ingredients.map((ingredient, index) => {
              const isString = typeof ingredient === "string";
              const name = isString
                ? ingredient
                : ingredient.name ?? ingredient.item ?? "Ingredient";
              const amount = isString
                ? ""
                : [ingredient.quantity, ingredient.unit]
                    .filter((part) => part !== null && part !== undefined && part !== "")
                    .join(" ");
              const estimated =
                !isString && ingredient.estimated === true && Boolean(amount);

              return (
                <li
                  key={index}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-4"
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Mark ${name} as prepared`}
                      className="mt-1 h-5 w-5 shrink-0 accent-emerald-800"
                    />
                    <span>
                      <strong className="block text-stone-900">{name}</strong>
                      <span className="mt-1 block text-sm text-stone-700">
                        {estimated ? (
                          <>
                            <span className="mr-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                              Estimated
                            </span>
                            {amount}
                          </>
                        ) : (
                          amount || "Quantity not specified"
                        )}
                      </span>
                    </span>
                  </label>
                  {!isString && (ingredient.said || ingredient.notes) && (
                    <details className="ml-8 mt-3 border-t border-stone-200 pt-2">
                      <summary className="cursor-pointer text-sm font-medium text-emerald-900">
                        Ingredient details
                      </summary>
                      <div className="mt-2 space-y-2 text-sm text-stone-600">
                        {ingredient.said && <p>In the video: {ingredient.said}</p>}
                        {ingredient.notes && <p>{ingredient.notes}</p>}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#294d38]">Instructions</h2>
          <ol className="mt-4 space-y-4">
            {recipe.instructions.map((step, index) => (
              <li key={index} className="flex gap-3 text-stone-700">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e7eadb] font-bold text-[#294d38]">
                  {index + 1}
                </span>
                <span className="pt-1">
                  {typeof step === "string" ? step : step.instruction}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {recipe.tips?.length ? (
          <section className="mt-8">
            <h2 className="text-2xl font-bold text-[#294d38]">Tips</h2>
            <ul className="mt-3 list-disc space-y-1 pl-6 text-stone-700">
              {recipe.tips.map((tip, index) => <li key={index}>{tip}</li>)}
            </ul>
          </section>
        ) : null}

        {recipe.equipment?.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-[#294d38]">Equipment</h2>
            <ul className="mt-2 list-disc pl-6 text-stone-700">
              {recipe.equipment.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </section>
        ) : null}

        {recipe.dietary_tags?.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-[#294d38]">Dietary information</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {recipe.dietary_tags.map((tag, index) => (
                <li key={`${tag}-${index}`} className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-900">
                  {tag}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(Array.isArray(recipe.missing_information)
          ? recipe.missing_information.length > 0
          : Boolean(recipe.missing_information)) && (
          <section className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <h2 className="font-semibold">Missing Recipe Information</h2>
            {Array.isArray(recipe.missing_information) ? (
              <ul className="mt-2 list-disc pl-6 text-sm">
                {recipe.missing_information.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm">{recipe.missing_information}</p>
            )}
          </section>
        )}

        <div className="mt-8">
          <VideoExtractionDetails
            transcript={transcript}
            ocrCandidates={ocrCandidates}
          />
        </div>

        <p className="mt-8 border-t border-stone-200 pt-4 text-sm text-stone-600">
          AI-generated recipes may contain mistakes. Verify ingredients,
          measurements, temperatures, and cooking instructions before use.
        </p>
      </article>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUserId } from "@project/auth";
import { getGeneratedRecipeForUser, savedRecipePayloadSchema } from "@project/domain";
import SaveGeneratedRecipeButton from "../../../components/SaveGeneratedRecipeButton";
import SaveRecipeButton from "../../../components/SaveRecipeButton";
import VideoExtractionDetails from "../../../components/VideoExtractionDetails";
import RegenerateRecipeButton from "../../../components/RegenerateRecipeButton";
import OriginalVideoAttribution from "../../../components/OriginalVideoAttribution";
import RecipeCoverImage from "../../../components/RecipeCoverImage";
import { demoRecipes } from "../../../lib/demo-recipes";

export const dynamic = "force-dynamic";

function hasKnownValue(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "unknown" && normalized !== "not specified");
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const demo = demoRecipes.find((recipe) => recipe.id === id);
  if (demo) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <Link href="/home#discover-recipes" className="font-semibold text-[#294d38]">
          ← Back to recipes
        </Link>
        <div className="mt-7 grid gap-8 md:grid-cols-2">
          <img
            src={demo.image}
            alt={demo.title}
            className="aspect-[4/5] w-full rounded-[2rem] object-cover"
          />
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[#a86d47]">
              {demo.category}
            </p>
            <h1 className="mt-3 text-4xl font-black text-[#294d38] md:text-5xl">
              {demo.title}
            </h1>
            <p className="mt-4 text-lg text-stone-600">{demo.description}</p>
            <div className="mt-6 flex gap-4 text-sm font-semibold text-stone-700">
              <span>◷ {demo.time}</span>
              <span>♧ {demo.servings} servings</span>
            </div>
            <div className="mt-6"><SaveRecipeButton id={demo.id} /></div>
            <section className="mt-10">
              <h2 className="mb-4 text-2xl font-bold text-[#294d38]">Ingredients</h2>
              <div className="space-y-3">
                {demo.ingredients.map((ingredient, index) => (
                  <label key={index} className="flex items-center gap-3 rounded-xl bg-white p-3">
                    <input type="checkbox" className="h-5 w-5 accent-[#294d38]" />
                    <span>{ingredient}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </div>
        <section className="mt-12 rounded-3xl bg-white p-6 md:p-10">
          <h2 className="mb-6 text-3xl font-bold text-[#294d38]">Let&apos;s make it</h2>
          <ol className="space-y-5">
            {demo.instructions.map((step, index) => (
              <li key={index} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7eadb] font-bold text-[#294d38]">
                  {index + 1}
                </span>
                <p className="pt-1 text-stone-700">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    );
  }

  const userId = await currentUserId();
  const generated = await getGeneratedRecipeForUser(id, userId);
  if (!generated) notFound();

  const parsed = savedRecipePayloadSchema.safeParse({
    recipe: generated.recipe,
    transcript: generated.transcript ?? "",
    ocrCandidates: generated.ocrCandidates ?? [],
    model: generated.model ?? "",
    sourceVideo: generated.videoSource.originalUrl,
  });
  if (!parsed.success) notFound();

  const { recipe, transcript, ocrCandidates, model, sourceVideo } = parsed.data;
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
      <Link href="/home#discover-recipes" className="font-semibold text-[#294d38]">
        ← Back to Explore
      </Link>
      <article className="mt-7 rounded-3xl bg-white p-6 shadow-sm md:p-10">
        <RecipeCoverImage
          src={generated.coverImageKey ? `/api/recipes/media/${generated.id}` : null}
          alt={`Cover image for ${recipe.title}`}
          className="mb-7 aspect-video w-full rounded-2xl object-cover"
        />
        <header>
          <p className="text-sm font-bold uppercase tracking-widest text-[#a86d47]">
            {generated.videoSource.platform ?? "Video recipe"}
          </p>
          <h1 className="mt-2 text-4xl font-black text-[#294d38] md:text-5xl">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="mt-4 text-lg text-stone-600">{recipe.description}</p>
          )}
          <OriginalVideoAttribution
            platform={
              generated.videoSource.sourcePlatform ??
              generated.videoSource.platform
            }
            videoUrl={
              generated.videoSource.sourceVideoUrl ??
              generated.videoSource.canonicalUrl ??
              sourceVideo ??
              null
            }
            creatorUsername={generated.videoSource.sourceCreatorUsername}
            creatorName={generated.videoSource.sourceCreatorName}
            creatorProfileUrl={generated.videoSource.sourceCreatorProfileUrl}
            recipeHubContributor={
              generated.owner?.username ?? generated.owner?.name ?? null
            }
          />
          {(hasKnownValue(recipe.servings) ||
            hasKnownValue(recipe.prep_time) ||
            hasKnownValue(recipe.cook_time)) && (
            <dl className="mt-6 flex flex-wrap gap-5 border-y border-stone-200 py-4 text-sm text-stone-700">
              {hasKnownValue(recipe.servings) && (
                <div><dt className="inline font-semibold">Servings: </dt><dd className="inline">{recipe.servings}</dd></div>
              )}
              {hasKnownValue(recipe.prep_time) && (
                <div><dt className="inline font-semibold">Prep: </dt><dd className="inline">{recipe.prep_time}</dd></div>
              )}
              {hasKnownValue(recipe.cook_time) && (
                <div><dt className="inline font-semibold">Cook: </dt><dd className="inline">{recipe.cook_time}</dd></div>
              )}
            </dl>
          )}
        </header>

        <div className="mt-6">
          <SaveGeneratedRecipeButton
            recipe={recipe}
            transcript={transcript ?? ""}
            ocrCandidates={ocrCandidates ?? []}
            model={model ?? ""}
            sourceVideo={sourceVideo ?? null}
            generatedRecipeId={generated.id}
            accessToken={null}
            coverImageUrl={
              generated.coverImageKey
                ? `/api/recipes/media/${generated.id}`
                : null
            }
            sourceType={generated.videoSource.sourceType}
            sourceAttribution={{
              sourcePlatform: generated.videoSource.sourcePlatform,
              sourceVideoUrl:
                generated.videoSource.sourceVideoUrl ??
                generated.videoSource.canonicalUrl,
              sourceCreatorUsername:
                generated.videoSource.sourceCreatorUsername,
              sourceCreatorName: generated.videoSource.sourceCreatorName,
              sourceCreatorProfileUrl:
                generated.videoSource.sourceCreatorProfileUrl,
            }}
          />
        </div>
        {userId && generated.ownerId === userId && generated.videoSource.sourceType === "LINK" && (
          <RegenerateRecipeButton sourceId={generated.videoSource.id} />
        )}

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#294d38]">Ingredients</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {recipe.ingredients.map((ingredient, index) => {
              const isString = typeof ingredient === "string";
              const name = isString
                ? ingredient
                : ingredient.name ?? ingredient.item ?? "Ingredient";
              const quantity = isString
                ? ""
                : [ingredient.quantity, ingredient.unit]
                    .filter((part) => part !== null && part !== undefined && part !== "")
                    .join(" ");
              return (
                <li key={index} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <strong className="block text-stone-900">{name}</strong>
                  <p className="mt-1 text-sm text-stone-700">
                    {!isString && ingredient.estimated && quantity ? (
                      <><span className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Estimated</span>{quantity}</>
                    ) : quantity || "Quantity not specified"}
                  </p>
                  {!isString && (ingredient.said || ingredient.notes) && (
                    <details className="mt-3 border-t border-stone-200 pt-2">
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

        <VideoExtractionDetails
          transcript={transcript ?? ""}
          ocrCandidates={ocrCandidates ?? []}
        />
        <p className="mt-8 border-t border-stone-200 pt-4 text-sm text-stone-600">
          AI-generated recipes may contain mistakes. Verify ingredients,
          measurements, temperatures, and cooking instructions before use.
        </p>
      </article>
    </main>
  );
}

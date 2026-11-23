import { currentUserId } from "@project/auth";
import {
  bookmarkDemoRecipe,
  listSavedRecipesForUser,
  saveGeneratedRecipeForUser,
  saveRecipeForUser,
  savedRecipePayloadSchema,
} from "@project/domain";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }

  try {
    const recipes = await listSavedRecipesForUser(userId);
    return Response.json({
      recipes: recipes.map((saved) => {
        const recipe = saved.generatedRecipe?.recipe ?? saved.recipe;
        const image =
          saved.generatedRecipe?.coverImageKey
            ? `/api/recipes/media/${saved.generatedRecipe.id}`
            : recipe &&
                typeof recipe === "object" &&
                !Array.isArray(recipe) &&
                "image" in recipe &&
                typeof recipe.image === "string"
              ? recipe.image
              : null;
        const category =
          recipe &&
          typeof recipe === "object" &&
          !Array.isArray(recipe) &&
          "category" in recipe &&
          typeof recipe.category === "string"
            ? recipe.category
            : saved.generatedRecipe
              ? "Created from video"
              : "Recipe";
        return {
          id: saved.id,
          title: saved.title,
          sourceVideo: saved.sourceVideo,
          createdAt: saved.createdAt,
          recipeId:
            saved.generatedRecipe?.id ??
            (recipe &&
            typeof recipe === "object" &&
            !Array.isArray(recipe) &&
            "id" in recipe &&
            typeof recipe.id === "string"
              ? recipe.id
              : null),
          image,
          category,
          sourcePlatform:
            saved.generatedRecipe?.videoSource.sourcePlatform ?? null,
          sourceVideoUrl:
            saved.generatedRecipe?.videoSource.sourceVideoUrl ?? null,
          sourceCreatorUsername:
            saved.generatedRecipe?.videoSource.sourceCreatorUsername ?? null,
          sourceCreatorName:
            saved.generatedRecipe?.videoSource.sourceCreatorName ?? null,
          sourceCreatorProfileUrl:
            saved.generatedRecipe?.videoSource.sourceCreatorProfileUrl ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Unable to load saved recipes:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load saved recipes.", 500);
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be JSON.", 400);
  }

  if (
    body &&
    typeof body === "object" &&
    "generatedRecipeId" in body &&
    typeof body.generatedRecipeId === "string"
  ) {
    const accessToken =
      "accessToken" in body && typeof body.accessToken === "string"
        ? body.accessToken
        : undefined;
    try {
      const savedRecipe = await saveGeneratedRecipeForUser(
        userId,
        body.generatedRecipeId,
        accessToken,
      );
      return savedRecipe
        ? Response.json({ savedRecipe }, { status: 201 })
        : errorResponse("NOT_FOUND", "Recipe not found.", 404);
    } catch (error) {
      console.error("Unable to bookmark generated recipe:", error);
      return errorResponse("INTERNAL_ERROR", "Unable to save this recipe.", 500);
    }
  }

  const parsed = savedRecipePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_RECIPE", "Recipe details are invalid.", 400);
  }

  try {
    const savedRecipe = parsed.data.recipe.image
      ? await bookmarkDemoRecipe(userId, {
          id:
            parsed.data.recipe.id ??
            `saved-${parsed.data.recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: parsed.data.recipe.title,
          description: parsed.data.recipe.description ?? "",
          image: parsed.data.recipe.image,
          category: parsed.data.recipe.category,
          time: parsed.data.recipe.time,
          servings:
            typeof parsed.data.recipe.servings === "number"
              ? parsed.data.recipe.servings
              : undefined,
          ingredients: parsed.data.recipe.ingredients.map((ingredient) =>
            typeof ingredient === "string"
              ? ingredient
              : ingredient.name ?? ingredient.item ?? "",
          ),
          instructions: parsed.data.recipe.instructions.map((step) =>
            typeof step === "string" ? step : step.instruction,
          ),
        })
      : await saveRecipeForUser(userId, parsed.data);
    return Response.json({ savedRecipe }, { status: 201 });
  } catch (error) {
    console.error("Unable to save recipe:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to save this recipe.", 500);
  }
}

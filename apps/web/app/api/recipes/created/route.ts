import { currentUserId } from "@project/auth";
import { listCreatedRecipesForUser } from "@project/domain";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }
  try {
    const recipes = await listCreatedRecipesForUser(userId);
    return Response.json({
      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        sourceVideo:
          recipe.videoSource.sourceVideoUrl ??
          recipe.videoSource.canonicalUrl ??
          recipe.videoSource.originalUrl,
        sourcePlatform:
          recipe.videoSource.sourcePlatform ?? recipe.videoSource.platform,
        sourceVideoUrl:
          recipe.videoSource.sourceVideoUrl ??
          recipe.videoSource.canonicalUrl ??
          recipe.videoSource.originalUrl,
        sourceVideoId: recipe.videoSource.sourceVideoId ?? recipe.videoSource.videoId,
        sourceCreatorUsername: recipe.videoSource.sourceCreatorUsername,
        sourceCreatorName: recipe.videoSource.sourceCreatorName,
        sourceCreatorProfileUrl: recipe.videoSource.sourceCreatorProfileUrl,
        createdAt: recipe.createdAt,
        visibility: recipe.visibility.toLowerCase(),
        image: recipe.coverImageKey ? `/api/recipes/media/${recipe.id}` : null,
        sourceType: recipe.videoSource.sourceType,
      })),
    });
  } catch (error) {
    console.error("Unable to load created recipes:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load created recipes.", 500);
  }
}

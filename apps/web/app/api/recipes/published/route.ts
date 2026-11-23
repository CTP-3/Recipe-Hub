import { listPublishedRecipes } from "@project/domain";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const requestedLimit = Number(url.searchParams.get("limit") ?? "12");
  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 50
  ) {
    return errorResponse("INVALID_REQUEST", "Limit must be between 1 and 50.", 400);
  }

  try {
    const result = await listPublishedRecipes(cursor, requestedLimit);
    return Response.json({
      recipes: result.recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        description:
          recipe.recipe &&
          typeof recipe.recipe === "object" &&
          "description" in recipe.recipe &&
          typeof recipe.recipe.description === "string"
            ? recipe.recipe.description
            : "",
        image: recipe.coverImageKey
          ? `/api/recipes/media/${recipe.id}`
          : null,
        category: "Video recipe",
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
      })),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    console.error("Unable to load published recipes:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load Explore recipes.", 500);
  }
}

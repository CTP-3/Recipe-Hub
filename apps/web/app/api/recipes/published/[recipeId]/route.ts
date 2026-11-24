import { currentUserId } from "@project/auth";
import { publishGeneratedRecipe } from "@project/domain";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }
  const { recipeId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be JSON.", 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("published" in body) ||
    typeof body.published !== "boolean"
  ) {
    return errorResponse("INVALID_REQUEST", "Provide a publication state.", 400);
  }

  try {
    const recipe = await publishGeneratedRecipe(userId, recipeId, body.published);
    if (!recipe) {
      return errorResponse("NOT_FOUND", "Recipe not found.", 404);
    }
    return Response.json({
      recipe: { id: recipe.id, visibility: recipe.visibility.toLowerCase() },
    });
  } catch (error) {
    console.error("Unable to update recipe publication:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to update publication.", 500);
  }
}

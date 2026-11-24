import { currentUserId } from "@project/auth";
import {
  deleteSavedRecipeForUser,
  getSavedRecipeForUser,
} from "@project/domain";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }

  const { id } = await params;
  try {
    const recipe = await getSavedRecipeForUser(userId, id);
    return recipe
      ? Response.json({ recipe })
      : errorResponse("NOT_FOUND", "Recipe not found.", 404);
  } catch (error) {
    console.error("Unable to load saved recipe:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load this recipe.", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("UNAUTHENTICATED", "Authentication required.", 401);
  }

  const { id } = await params;
  try {
    const deleted = await deleteSavedRecipeForUser(userId, id);
    return deleted
      ? new Response(null, { status: 204 })
      : errorResponse("NOT_FOUND", "Recipe not found.", 404);
  } catch (error) {
    console.error("Unable to delete saved recipe:", error);
    return errorResponse("INTERNAL_ERROR", "Unable to remove this recipe.", 500);
  }
}

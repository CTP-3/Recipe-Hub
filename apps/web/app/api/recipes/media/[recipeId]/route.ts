import { currentUserId } from "@project/auth";
import { getGeneratedRecipeForUser } from "@project/domain";
import { downloadAttachment } from "@project/services";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId } = await params;
  const userId = await currentUserId();
  const accessToken = new URL(request.url).searchParams.get("accessToken");
  if (accessToken && !/^[A-Za-z0-9_-]{32,64}$/.test(accessToken)) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Image not found." } },
      { status: 404 },
    );
  }
  try {
    const recipe = await getGeneratedRecipeForUser(
      recipeId,
      userId,
      accessToken,
    );
    if (!recipe?.coverImageKey) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Image not found." } }, { status: 404 });
    }

    const image = await downloadAttachment(recipe.coverImageKey);
    if (!image) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Image not found." } }, { status: 404 });
    }

    const body = image.data.buffer.slice(
      image.data.byteOffset,
      image.data.byteOffset + image.data.byteLength,
    ) as ArrayBuffer;
    return new Response(new Blob([body], { type: image.contentType }), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control":
          recipe.visibility === "PUBLIC"
            ? "public, max-age=3600"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load recipe cover:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to load this image." } },
      { status: 500 },
    );
  }
}

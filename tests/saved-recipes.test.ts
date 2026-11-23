import { beforeAll, describe, expect, it } from "vitest";

type SavedRecipeDomain = typeof import("@project/domain");
type PrismaClient = import("@project/db").PrismaClient;

let domain: SavedRecipeDomain;
let prisma: PrismaClient;
const ownerId = "saved-recipe-owner";
const otherUserId = "saved-recipe-other";

const payload = {
  recipe: {
    title: "Test salmon",
    description: "A saved test recipe.",
    servings: null,
    prep_time: null,
    cook_time: "17 min",
    ingredients: [
      {
        name: "salmon",
        quantity: 2,
        unit: "fillets",
        estimated: true,
        said: "some salmon",
        notes: "Estimated from the video.",
      },
      {
        name: "cream",
        quantity: 1,
        unit: "cup",
        estimated: false,
        said: "one cup of cream",
        notes: null,
      },
    ],
    instructions: ["Bake until cooked through."],
    tips: ["Check for doneness."],
  },
  transcript: "Use some salmon and one cup of cream.",
  ocrCandidates: [{ time: 2, text: "400 F" }],
  model: "summarize",
  sourceVideo: "salmon-video.mp4",
};

beforeAll(async () => {
  process.env.PGLITE_DATA_DIR = "memory://";
  delete process.env.DATABASE_URL;
  domain = await import("@project/domain");
  const db = await import("@project/db");
  prisma = db.prisma;
  await prisma.user.create({ data: { id: ownerId } });
  await prisma.user.create({ data: { id: otherUserId } });
}, 30_000);

describe("saved recipes", () => {
  it("accepts estimated quantities without optional notes and rejects missing estimates", () => {
    const estimatedWithoutNotes = {
      ...payload,
      recipe: {
        ...payload.recipe,
        ingredients: [
          { ...payload.recipe.ingredients[0], notes: null },
          payload.recipe.ingredients[1],
        ],
      },
    };
    expect(
      domain.savedRecipePayloadSchema.safeParse(estimatedWithoutNotes).success,
    ).toBe(true);

    const missingEstimate = {
      ...estimatedWithoutNotes,
      recipe: {
        ...estimatedWithoutNotes.recipe,
        ingredients: [
          { ...estimatedWithoutNotes.recipe.ingredients[0], quantity: null },
          estimatedWithoutNotes.recipe.ingredients[1],
        ],
      },
    };
    expect(
      domain.savedRecipePayloadSchema.safeParse(missingEstimate).success,
    ).toBe(false);
  });

  it("persists complete recipe evidence and deduplicates per owner", async () => {
    const first = await domain.saveRecipeForUser(ownerId, payload);
    const duplicate = await domain.saveRecipeForUser(ownerId, {
      ...payload,
      transcript: "A differently transcribed version.",
      model: "generate",
    });

    expect(duplicate.id).toBe(first.id);
    expect(await domain.listSavedRecipesForUser(ownerId)).toHaveLength(1);
    await expect(domain.getSavedRecipeForUser(ownerId, first.id)).resolves.toMatchObject({
      recipe: payload,
      sourceVideo: "salmon-video.mp4",
    });
  });

  it("does not expose or delete another user's recipe", async () => {
    const saved = await domain.saveRecipeForUser(ownerId, payload);

    await expect(domain.getSavedRecipeForUser(otherUserId, saved.id)).resolves.toBeNull();
    await expect(domain.deleteSavedRecipeForUser(otherUserId, saved.id)).resolves.toBe(false);
    await expect(domain.getSavedRecipeForUser(ownerId, saved.id)).resolves.not.toBeNull();
  });
});

import { createHash } from "node:crypto";
import { Prisma, prisma } from "@project/db";
import { z } from "zod";

const ingredientSchema = z
  .union([
    z.string().max(500).refine((value) => value.trim().length > 0),
    z
      .object({
        name: z.string().max(500).optional(),
        item: z.string().max(500).optional(),
        quantity: z
          .union([
            z
              .string()
              .max(200)
              .refine((quantity) => quantity.trim().length > 0),
            z.number().finite().nonnegative(),
          ])
          .nullable()
          .optional(),
        unit: z.string().max(100).nullable().optional(),
        estimated: z.boolean().optional(),
        said: z.string().max(10_000).nullable().optional(),
        notes: z.string().max(10_000).nullable().optional(),
      })
      .strict()
      .refine(
        (ingredient) =>
          Boolean(ingredient.name?.trim() || ingredient.item?.trim()) &&
          (!ingredient.name || ingredient.name.trim().length > 0) &&
          (!ingredient.item || ingredient.item.trim().length > 0),
        "Ingredient name is required.",
      )
      .refine(
        (ingredient) =>
          !ingredient.estimated ||
          (ingredient.quantity !== undefined &&
            ingredient.quantity !== null &&
            (typeof ingredient.quantity !== "string" ||
              ingredient.quantity.trim().length > 0)),
        "Estimated ingredients require an estimated quantity.",
      ),
  ]);

const instructionSchema = z.union([
  z.string().max(10_000).refine((value) => value.trim().length > 0),
  z
    .object({
      step: z.number().int().positive().optional(),
      instruction: z.string().max(10_000).refine((value) => value.trim().length > 0),
    })
    .strict(),
]);

export const savedRecipePayloadSchema = z
  .object({
    recipe: z
      .object({
        id: z.string().max(200).optional(),
        title: z.string().trim().min(1).max(500),
        description: z.string().max(10_000).nullable().optional(),
        servings: z
          .union([
            z.string().max(100),
            z.number().int().positive(),
          ])
          .nullable()
          .optional(),
        prep_time: z.string().max(100).nullable().optional(),
        prep_minutes: z.number().int().nonnegative().nullable().optional(),
        cook_time: z.string().max(100).nullable().optional(),
        cook_minutes: z.number().int().nonnegative().nullable().optional(),
        temperature: z.string().max(200).nullable().optional(),
        ingredients: z.array(ingredientSchema).max(500),
        instructions: z.array(instructionSchema).max(500),
        steps: z.array(z.string().max(10_000)).max(500).optional(),
        tips: z.array(z.string().max(5_000)).max(200).optional(),
        equipment: z.array(z.string().max(500)).max(200).optional(),
        dietary_tags: z.array(z.string().max(200)).max(100).optional(),
        image: z.string().url().max(2_048).optional(),
        category: z.string().max(200).optional(),
        time: z.string().max(100).optional(),
        missing_information: z
          .union([z.string().max(5_000), z.array(z.string().max(5_000)).max(100)])
          .nullable()
          .optional(),
      })
      .strict(),
    transcript: z.string().max(100_000).optional(),
    ocrCandidates: z
      .array(
        z
          .object({
            time: z.number().finite(),
            text: z.string().max(10_000),
          })
          .strict(),
      )
      .max(1_000)
      .optional(),
    model: z.string().max(200).optional(),
    sourceVideo: z.string().max(2_048).nullable().optional(),
  })
  .strict();

export type SavedRecipePayload = z.infer<typeof savedRecipePayloadSchema>;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function saveRecipeForUser(
  userId: string,
  payload: SavedRecipePayload,
) {
  const fingerprint = createHash("sha256")
    .update(
      canonicalize({
        recipe: payload.recipe,
        sourceVideo: payload.sourceVideo,
      }),
    )
    .digest("hex");
  return prisma.savedRecipe.upsert({
    where: { userId_fingerprint: { userId, fingerprint } },
    create: {
      userId,
      fingerprint,
      title: payload.recipe.title,
      recipe: toInputJsonValue(payload),
      sourceVideo: payload.sourceVideo ?? null,
    },
    update: {},
    select: { id: true, title: true, createdAt: true },
  });
}

export async function listSavedRecipesForUser(userId: string) {
  return prisma.savedRecipe.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceVideo: true,
      createdAt: true,
      recipe: true,
      generatedRecipe: {
        select: {
          id: true,
          recipe: true,
          coverImageKey: true,
          videoSource: {
            select: {
              sourcePlatform: true,
              sourceVideoUrl: true,
              sourceVideoId: true,
              sourceCreatorUsername: true,
              sourceCreatorName: true,
              sourceCreatorProfileUrl: true,
            },
          },
        },
      },
    },
  });
}

export async function getSavedRecipeForUser(userId: string, id: string) {
  return prisma.savedRecipe.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      recipe: true,
      sourceVideo: true,
      createdAt: true,
      generatedRecipe: {
        include: {
          videoSource: true,
          owner: { select: { name: true, username: true } },
        },
      },
    },
  });
}

export async function deleteSavedRecipeForUser(userId: string, id: string) {
  const result = await prisma.savedRecipe.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

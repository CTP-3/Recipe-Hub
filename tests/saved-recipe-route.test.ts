import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "session-owner" as string | null,
  save: vi.fn(),
  saveGenerated: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  parse: (data: unknown) =>
    data &&
    typeof data === "object" &&
    "userId" in data
      ? { success: false, error: "unexpected user id" }
      : { success: true, data },
}));

vi.mock("../packages/auth/src/auth", () => ({
  auth: vi.fn(async () =>
    state.userId ? { user: { id: state.userId } } : null,
  ),
}));

vi.mock("../packages/domain/src/index", () => ({
  saveRecipeForUser: state.save,
  saveGeneratedRecipeForUser: state.saveGenerated,
  getSavedRecipeForUser: state.get,
  deleteSavedRecipeForUser: state.remove,
  savedRecipePayloadSchema: { safeParse: state.parse },
}));

import { POST } from "../apps/web/app/api/recipes/saved/route";
import {
  DELETE,
  GET,
} from "../apps/web/app/api/recipes/saved/[id]/route";

const payload = {
  recipe: {
    title: "Test recipe",
    ingredients: [
      {
        name: "paprika",
        quantity: 1,
        unit: "tsp",
        estimated: true,
        said: "some paprika",
        notes: "Estimated quantity.",
      },
    ],
    instructions: ["Season the dish."],
  },
  sourceVideo: "video.mp4",
};

beforeEach(() => {
  state.userId = "session-owner";
  state.save.mockReset().mockResolvedValue({
    id: "saved-id",
    title: "Test recipe",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  state.saveGenerated.mockReset().mockResolvedValue({
    id: "generated-saved-id",
    title: "Generated recipe",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  state.get.mockReset().mockResolvedValue(null);
  state.remove.mockReset().mockResolvedValue(false);
});

describe("saved recipe API", () => {
  it("saves for the authenticated session owner", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(201);
    expect(state.save).toHaveBeenCalledWith("session-owner", payload);
  });

  it("rejects browser-supplied user ids", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, userId: "attacker-id" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("requires authentication and saves an existing generated recipe without copying it", async () => {
    state.userId = null;
    const unauthenticated = await POST(
      new Request("http://localhost/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedRecipeId: "generated-id" }),
      }),
    );
    expect(unauthenticated.status).toBe(401);
    expect(state.saveGenerated).not.toHaveBeenCalled();

    state.userId = "session-owner";
    const response = await POST(
      new Request("http://localhost/api/recipes/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generatedRecipeId: "generated-id",
          accessToken: "a".repeat(43),
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(state.saveGenerated).toHaveBeenCalledWith(
      "session-owner",
      "generated-id",
      "a".repeat(43),
    );
  });

  it("returns 404 for foreign recipes and scopes deletion by session owner", async () => {
    const context = { params: Promise.resolve({ id: "foreign-id" }) };
    const response = await GET(
      new Request("http://localhost/api/recipes/saved/foreign-id"),
      context,
    );

    expect(response.status).toBe(404);
    expect(state.get).toHaveBeenCalledWith("session-owner", "foreign-id");

    const deleteResponse = await DELETE(
      new Request("http://localhost/api/recipes/saved/foreign-id", {
        method: "DELETE",
      }),
      context,
    );
    expect(deleteResponse.status).toBe(404);
    expect(state.remove).toHaveBeenCalledWith("session-owner", "foreign-id");
  });
});

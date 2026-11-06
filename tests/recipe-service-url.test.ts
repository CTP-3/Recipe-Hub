import { afterEach, describe, expect, it } from "vitest";
import { recipeServiceUrl } from "../apps/web/app/api/recipes/service-url";

const originalServiceUrl = process.env.RECIPE_SERVICE_URL;

afterEach(() => {
  if (originalServiceUrl === undefined) {
    delete process.env.RECIPE_SERVICE_URL;
  } else {
    process.env.RECIPE_SERVICE_URL = originalServiceUrl;
  }
});

describe("recipeServiceUrl", () => {
  it("resolves both endpoints from the default service URL", () => {
    delete process.env.RECIPE_SERVICE_URL;

    expect(recipeServiceUrl("extract").toString()).toBe(
      "http://127.0.0.1:8000/extract",
    );
    expect(recipeServiceUrl("extract-link").toString()).toBe(
      "http://127.0.0.1:8000/extract-link",
    );
  });

  it("resolves an endpoint from a configured service base URL", () => {
    process.env.RECIPE_SERVICE_URL = "https://recipes.example/v1/";

    expect(recipeServiceUrl("extract-link").toString()).toBe(
      "https://recipes.example/v1/extract-link",
    );
  });

  it("replaces an explicitly configured extraction endpoint", () => {
    process.env.RECIPE_SERVICE_URL = "https://recipes.example/v1/extract/";

    expect(recipeServiceUrl("extract-link").toString()).toBe(
      "https://recipes.example/v1/extract-link",
    );
  });
});

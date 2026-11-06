type RecipeServiceEndpoint = "extract" | "extract-link";

export function recipeServiceUrl(endpoint: RecipeServiceEndpoint): URL {
  const serviceUrl = new URL(
    process.env.RECIPE_SERVICE_URL ?? "http://127.0.0.1:8000",
  );
  const pathname = serviceUrl.pathname.replace(/\/+$/, "");
  const endpointIndex = pathname.lastIndexOf("/extract");
  const hasEndpoint =
    endpointIndex >= 0 &&
    (pathname.slice(endpointIndex) === "/extract" ||
      pathname.slice(endpointIndex) === "/extract-link");
  const basePath = hasEndpoint ? pathname.slice(0, endpointIndex) : pathname;

  serviceUrl.pathname = `${basePath}/${endpoint}`;
  return serviceUrl;
}

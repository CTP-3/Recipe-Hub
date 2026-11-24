import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webModule = (name: string) =>
  fileURLToPath(new URL(`./apps/web/node_modules/${name}`, import.meta.url));

export default defineConfig({
  // React is installed for apps/web only; component tests borrow it.
  resolve: { alias: { "react-dom": webModule("react-dom"), react: webModule("react") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Never let a test reach the local development database.
    env: { PGLITE_DATA_DIR: "memory://" },
  },
});

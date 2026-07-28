import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environmentMatchGlobs: [["convex/**/*.test.ts", "edge-runtime"]],
    server: { deps: { inline: ["convex-test"] } },
  },
});

import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    exclude: [...configDefaults.exclude, ".claude/worktrees/**", "e2e/**"],
  },
});

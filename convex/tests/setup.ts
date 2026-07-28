import { convexTest } from "convex-test";
import schema from "../schema";

export function setupTest() {
  // Deferred inside the function (rather than at module scope) so that Convex's
  // push-time bundler, which executes this module's top level to analyze its
  // exports, doesn't eagerly evaluate the Vite-only `import.meta.glob` macro.
  const modules = import.meta.glob("../**/*.ts");
  return convexTest(schema, modules);
}

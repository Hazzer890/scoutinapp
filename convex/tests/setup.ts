import { convexTest } from "convex-test";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

export function setupTest() {
  return convexTest(schema, modules);
}

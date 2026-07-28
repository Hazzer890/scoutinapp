import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new Error("Admin only");
  return user;
}

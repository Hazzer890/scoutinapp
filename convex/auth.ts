import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { GenericMutationCtx } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { DataModel } from "./_generated/dataModel";

// Exported so tests can drive it directly without exercising the full sign-in flow.
export async function bootstrapRole(
  ctx: GenericMutationCtx<DataModel>,
  { userId, existingUserId }: { userId: Id<"users">; existingUserId: Id<"users"> | null },
) {
  if (existingUserId !== null) return;
  const users = await ctx.db.query("users").take(2);
  await ctx.db.patch(userId, { role: users.length === 1 ? "admin" : "scout" });
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    afterUserCreatedOrUpdated: bootstrapRole,
  },
});

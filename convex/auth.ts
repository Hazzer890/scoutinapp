import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { GenericMutationCtx } from "convex/server";
import { ConvexError } from "convex/values";
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

// Runs inside the auth mutation, so throwing rolls back the sign-up entirely.
export async function rejectBannedEmail(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
) {
  const email = (await ctx.db.get(userId))?.email;
  if (!email) return;
  const banned = await ctx.db
    .query("bannedEmails")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (banned) throw new ConvexError("This account has been banned");
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, args) => {
      await rejectBannedEmail(ctx, args.userId);
      await bootstrapRole(ctx, args);
    },
  },
});

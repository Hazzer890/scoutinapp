import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin } from "./model/authz";

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      phone: v.optional(v.string()),
      phoneVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(v.union(v.literal("admin"), v.literal("scout"))),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

const roleValidator = v.union(v.literal("admin"), v.literal("scout"));

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      role: v.union(roleValidator, v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
    }));
  },
});

// Dev escape hatch: promote a user by email without needing a signed-in admin.
// Run with: npx convex run users:setRoleByEmail '{"email":"...","role":"admin"}'
export const setRoleByEmail = internalMutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new ConvexError("User not found");
    await ctx.db.patch(user._id, { role });
    return null;
  },
});

export const setName = mutation({
  args: { userId: v.id("users"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, name }) => {
    await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name cannot be empty");
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { name: trimmed });
    return null;
  },
});

// Deletes the account and bans the email so they can't sign up again.
// Pit reports and comments are kept — they're scouting data, and readers
// already fall back to "Scout" when the author is gone.
export const remove = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === userId) throw new ConvexError("You cannot delete yourself");
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("User not found");

    const email = target.email;
    if (email) {
      const alreadyBanned = await ctx.db
        .query("bannedEmails")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (!alreadyBanned) await ctx.db.insert("bannedEmails", { email });
    }

    // Auth records: accounts block the credential, sessions/tokens sign them out now.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) await ctx.db.delete(account._id);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }

    // Personal rows that would otherwise skew watch counts and picklist merges.
    const watches = await ctx.db
      .query("watchlist")
      .withIndex("by_user_event", (q) => q.eq("userId", userId))
      .collect();
    for (const watch of watches) await ctx.db.delete(watch._id);
    // ponytail: full scan — no by-owner index and the table is tiny.
    const picklists = await ctx.db.query("picklists").collect();
    for (const list of picklists) {
      if (list.ownerId === userId) await ctx.db.delete(list._id);
    }

    await ctx.db.delete(userId);
    return null;
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("User not found");

    if (target.role === "admin" && role !== "admin") {
      const admins = await ctx.db.query("users").collect();
      const adminCount = admins.filter((u) => u.role === "admin").length;
      if (adminCount <= 1) throw new ConvexError("Cannot demote the last admin");
    }

    await ctx.db.patch(userId, { role });
    return null;
  },
});

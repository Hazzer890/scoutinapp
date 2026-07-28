import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./model/authz";
import type { Id } from "./_generated/dataModel";

export const eventValidator = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  tbaKey: v.string(),
  name: v.string(),
  isActive: v.boolean(),
});

export async function getActiveEvent(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("events")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .first();
}

export const getActive = query({
  args: {},
  returns: v.union(eventValidator, v.null()),
  handler: async (ctx) => await getActiveEvent(ctx),
});

// Shared by the manual `setActive` mutation and the TBA import mutation.
export async function upsertActiveEvent(
  ctx: MutationCtx,
  args: { tbaKey: string; name: string },
): Promise<Id<"events">> {
  const activeEvents = await ctx.db
    .query("events")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect();
  for (const event of activeEvents) {
    if (event.tbaKey !== args.tbaKey) {
      await ctx.db.patch(event._id, { isActive: false });
    }
  }

  const existing = await ctx.db
    .query("events")
    .withIndex("by_tba_key", (q) => q.eq("tbaKey", args.tbaKey))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { name: args.name, isActive: true });
    return existing._id;
  }
  return await ctx.db.insert("events", {
    tbaKey: args.tbaKey,
    name: args.name,
    isActive: true,
  });
}

export const setActive = mutation({
  args: { tbaKey: v.string(), name: v.string() },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await upsertActiveEvent(ctx, args);
  },
});

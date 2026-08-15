import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MAX_COMMENT_LENGTH } from "./lib/constants";
import { requireUser } from "./model/authz";

export const listForTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      _id: v.id("teamComments"),
      _creationTime: v.number(),
      text: v.string(),
      authorName: v.string(),
      canDelete: v.boolean(),
    }),
  ),
  handler: async (ctx, { teamId }) => {
    const user = await requireUser(ctx);
    const comments = await ctx.db
      .query("teamComments")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    // Newest first: scouts care about the latest word on a team.
    comments.sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.authorId);
        return {
          _id: comment._id,
          _creationTime: comment._creationTime,
          text: comment.text,
          authorName: author?.name ?? "Scout",
          canDelete: comment.authorId === user._id || user.role === "admin",
        };
      }),
    );
  },
});

export const add = mutation({
  args: { teamId: v.id("teams"), text: v.string() },
  returns: v.id("teamComments"),
  handler: async (ctx, { teamId, text }) => {
    const user = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new ConvexError("Team not found");

    const trimmed = text.trim();
    if (!trimmed) throw new ConvexError("Comment is empty");
    if (trimmed.length > MAX_COMMENT_LENGTH) throw new ConvexError("Comment is too long");

    return await ctx.db.insert("teamComments", {
      eventId: team.eventId,
      teamId,
      authorId: user._id,
      text: trimmed,
    });
  },
});

export const remove = mutation({
  args: { commentId: v.id("teamComments") },
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const user = await requireUser(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) return null;
    if (comment.authorId !== user._id && user.role !== "admin") {
      throw new ConvexError("Not your comment");
    }
    await ctx.db.delete(commentId);
    return null;
  },
});

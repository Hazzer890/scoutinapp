import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireUser } from "./model/authz";
import { getActiveEvent } from "./events";
import { BENCHMARK_TEAM } from "./lib/constants";
import { benchmarkPct } from "./lib/statsMath";
import type { Id } from "./_generated/dataModel";

const teamStatsValidator = v.object({
  ballsPerMatch: v.number(),
  pctOfBenchmark: v.union(v.number(), v.null()),
});

async function statsForEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const reports = await ctx.db
    .query("pitReports")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();

  const benchmarkTeam = await ctx.db
    .query("teams")
    .withIndex("by_event_number", (q) => q.eq("eventId", eventId).eq("number", BENCHMARK_TEAM))
    .first();
  const benchmarkBalls = benchmarkTeam
    ? (reports.find((r) => r.teamId === benchmarkTeam._id)?.ballsPerMatch ?? null)
    : null;

  const result: Record<string, { ballsPerMatch: number; pctOfBenchmark: number | null }> = {};
  for (const report of reports) {
    if (report.ballsPerMatch === undefined) continue;
    result[report.teamId] = {
      ballsPerMatch: report.ballsPerMatch,
      pctOfBenchmark: benchmarkPct(report.ballsPerMatch, benchmarkBalls),
    };
  }
  return result;
}

export const forEvent = query({
  args: {},
  returns: v.record(v.string(), teamStatsValidator),
  handler: async (ctx) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return {};
    return await statsForEvent(ctx, event._id);
  },
});

export const forTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.union(teamStatsValidator, v.null()),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const event = await getActiveEvent(ctx);
    if (!event) return null;
    const all = await statsForEvent(ctx, event._id);
    return all[teamId] ?? null;
  },
});

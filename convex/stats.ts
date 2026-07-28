import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireUser } from "./model/authz";
import { getActiveEvent } from "./events";
import { BENCHMARK_TEAM } from "./lib/constants";
import { benchmarkPct, computeTeamStats } from "./lib/statsMath";
import type { Doc, Id } from "./_generated/dataModel";

const teamStatsValidator = v.object({
  matchCount: v.number(),
  avgBalls: v.number(),
  accuracy: v.union(v.number(), v.null()),
  throughputBps: v.number(),
  throughputPctOfBenchmark: v.union(v.number(), v.null()),
  avgStorage: v.number(),
  climbSuccessRate: v.union(v.number(), v.null()),
});

async function statsForEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const reports = await ctx.db
    .query("matchReports")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();

  const byTeam = new Map<Id<"teams">, Doc<"matchReports">[]>();
  for (const report of reports) {
    const group = byTeam.get(report.teamId);
    if (group) group.push(report);
    else byTeam.set(report.teamId, [report]);
  }

  const benchmarkTeam = await ctx.db
    .query("teams")
    .withIndex("by_event_number", (q) => q.eq("eventId", eventId).eq("number", BENCHMARK_TEAM))
    .first();
  const benchmarkReports = benchmarkTeam ? (byTeam.get(benchmarkTeam._id) ?? []) : [];
  const benchmarkBps =
    benchmarkReports.length === 0 ? null : computeTeamStats(benchmarkReports).throughputBps;

  const result: Record<string, ReturnType<typeof computeTeamStats>> = {};
  for (const [teamId, teamReports] of byTeam) {
    const stats = computeTeamStats(teamReports);
    result[teamId] = {
      ...stats,
      throughputPctOfBenchmark: benchmarkPct(stats.throughputBps, benchmarkBps),
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

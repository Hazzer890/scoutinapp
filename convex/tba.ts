"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { mapTbaTeam, mapQualMatches } from "./lib/tbaMapping";
import type { TbaTeamRaw, TbaMatchRaw } from "./lib/tbaMapping";

const TBA_BASE = "https://www.thebluealliance.com/api/v3";

type ImportResult =
  | { ok: true; teams: number; matches: number }
  | { ok: false; error: string };

export const importEvent = action({
  args: { eventKey: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), teams: v.number(), matches: v.number() }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, { eventKey }): Promise<ImportResult> => {
    const isAdmin: boolean = await ctx.runQuery(internal.tbaImport.checkAdmin, {});
    if (!isAdmin) return { ok: false, error: "Admin only" };

    // Cast via globalThis rather than the ambient `process` global: this file's
    // types are pulled into the frontend's tsconfig (through _generated/api),
    // which has no Node types, so a bare `process` reference fails to resolve there.
    const apiKey = (globalThis as any).process?.env?.TBA_API_KEY as string | undefined;
    if (!apiKey) {
      return {
        ok: false,
        error: "TBA_API_KEY is not configured. Set it with `npx convex env set TBA_API_KEY <key>`.",
      };
    }
    const headers = { "X-TBA-Auth-Key": apiKey };

    const eventRes = await fetch(`${TBA_BASE}/event/${eventKey}`, { headers });
    if (!eventRes.ok) {
      return { ok: false, error: `Failed to fetch event: ${eventRes.status} ${eventRes.statusText}` };
    }
    const event = (await eventRes.json()) as { name: string };

    const teamsRes = await fetch(`${TBA_BASE}/event/${eventKey}/teams/simple`, { headers });
    if (!teamsRes.ok) {
      return { ok: false, error: `Failed to fetch teams: ${teamsRes.status} ${teamsRes.statusText}` };
    }
    const teamsRaw = (await teamsRes.json()) as TbaTeamRaw[];

    const matchesRes = await fetch(`${TBA_BASE}/event/${eventKey}/matches/simple`, { headers });
    if (!matchesRes.ok) {
      return { ok: false, error: `Failed to fetch matches: ${matchesRes.status} ${matchesRes.statusText}` };
    }
    const matchesRaw = (await matchesRes.json()) as TbaMatchRaw[];

    const result = await ctx.runMutation(internal.tbaImport.applyImport, {
      eventKey,
      eventName: event.name,
      teams: teamsRaw.map(mapTbaTeam),
      matches: mapQualMatches(matchesRaw),
    });

    return { ok: true, teams: result.teams, matches: result.matches };
  },
});

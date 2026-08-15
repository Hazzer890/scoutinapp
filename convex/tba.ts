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

type RefreshResult =
  | { ok: true; upcoming: number; total: number }
  | { ok: false; error: string };

// Cast via globalThis rather than the ambient `process` global: this file's
// types are pulled into the frontend's tsconfig (through _generated/api),
// which has no Node types, so a bare `process` reference fails to resolve there.
function tbaApiKey(): string | undefined {
  return (globalThis as any).process?.env?.TBA_API_KEY as string | undefined;
}

const MISSING_KEY_ERROR =
  "TBA_API_KEY is not configured. Set it with `npx convex env set TBA_API_KEY <key>`.";

export const importEvent = action({
  args: { eventKey: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), teams: v.number(), matches: v.number() }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx, { eventKey }): Promise<ImportResult> => {
    const isAdmin: boolean = await ctx.runQuery(internal.tbaImport.checkAdmin, {});
    if (!isAdmin) return { ok: false, error: "Admin only" };

    const apiKey = tbaApiKey();
    if (!apiKey) return { ok: false, error: MISSING_KEY_ERROR };
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

// Re-pulls just the qual schedule for the active event, so the Next Match view
// picks up TBA's revised predicted times and newly-played results without an
// admin re-running the full import.
export const refreshMatches = action({
  args: {},
  returns: v.union(
    v.object({ ok: v.literal(true), upcoming: v.number(), total: v.number() }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (ctx): Promise<RefreshResult> => {
    const { signedIn, tbaKey } = await ctx.runQuery(internal.tbaImport.activeEventKey, {});
    if (!signedIn) return { ok: false, error: "Not signed in" };
    if (!tbaKey) return { ok: false, error: "No active event" };

    const apiKey = tbaApiKey();
    if (!apiKey) return { ok: false, error: MISSING_KEY_ERROR };

    const res = await fetch(`${TBA_BASE}/event/${tbaKey}/matches/simple`, {
      headers: { "X-TBA-Auth-Key": apiKey },
    });
    if (!res.ok) {
      return { ok: false, error: `Failed to fetch matches: ${res.status} ${res.statusText}` };
    }
    const matchesRaw = (await res.json()) as TbaMatchRaw[];

    return await ctx.runMutation(internal.tbaImport.syncMatches, {
      matches: mapQualMatches(matchesRaw),
    });
  },
});

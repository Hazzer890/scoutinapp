import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

auth.addHttpRoutes(http);

// Public read-only export of an event's scouting data. No API key: anyone with
// the deployment URL can read it, scout names and notes included.
//
//   GET <deployment>.convex.site/api/scouting             -> active event
//   GET <deployment>.convex.site/api/scouting?event=2026x -> that event by TBA key
//
// CORS is wide open so browser-side tools and sheets scripts can fetch it.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      // The dump is a live snapshot; a cached copy would hide reports filed
      // seconds ago, which is exactly when this gets pulled at an event.
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

export const scoutingExport = httpAction(async (ctx, request) => {
  const eventKey = new URL(request.url).searchParams.get("event") ?? undefined;

  const data = await ctx.runQuery(internal.exportData.scoutingData, { eventKey });
  if (data === null) {
    return json(
      {
        error: eventKey
          ? `No event with TBA key "${eventKey}".`
          : "No active event. Set one, or pass ?event=<tbaKey>.",
      },
      404,
    );
  }

  return json({ exportedAt: Date.now(), ...data }, 200);
});

http.route({ path: "/api/scouting", method: "GET", handler: scoutingExport });

http.route({
  path: "/api/scouting",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS })),
});

export default http;

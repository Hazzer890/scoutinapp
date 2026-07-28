import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { tierValidator } from "./lib/constants";

export default defineSchema({
  ...authTables,
  users: defineTable({
    // authTables.users fields, copied so we can extend:
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("scout"))),
  }).index("email", ["email"]),
  events: defineTable({
    tbaKey: v.string(),
    name: v.string(),
    isActive: v.boolean(),
  })
    .index("by_active", ["isActive"])
    .index("by_tba_key", ["tbaKey"]),
  teams: defineTable({
    eventId: v.id("events"),
    tbaKey: v.optional(v.string()),
    number: v.number(),
    nickname: v.string(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_number", ["eventId", "number"]),
  matches: defineTable({
    eventId: v.id("events"),
    tbaKey: v.optional(v.string()),
    matchNumber: v.number(),
    redTeams: v.array(v.number()),
    blueTeams: v.array(v.number()),
    scheduledTime: v.optional(v.number()),
  }).index("by_event_match", ["eventId", "matchNumber"]),
  pitReports: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    scoutId: v.id("users"),
    canScoreBalls: v.boolean(),
    canClimb: v.boolean(),
    storageCapacity: v.optional(v.number()),
    driverRating: v.number(),
    defenseRating: v.number(),
    tags: v.array(v.string()),
    photoId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_event", ["eventId"]),
  matchReports: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    matchId: v.optional(v.id("matches")),
    matchNumber: v.number(),
    scoutId: v.id("users"),
    ballsScored: v.number(),
    ballsMissed: v.number(),
    maxStorage: v.number(),
    climbAttempted: v.boolean(),
    climbSucceeded: v.boolean(),
    playedDefense: v.boolean(),
    tags: v.array(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_event", ["eventId"])
    .index("by_scout", ["scoutId"]),
  picklists: defineTable({
    eventId: v.id("events"),
    ownerId: v.optional(v.id("users")), // absent = primary (admin-only) list
    entries: v.array(
      v.object({ teamId: v.id("teams"), tier: tierValidator, rank: v.number() })
    ),
  }).index("by_event_owner", ["eventId", "ownerId"]),
});

# Admin edits user names

Date: 2026-07-30
Status: approved

## Problem

User names appear on the leaderboard and in aggregated pit-report notes. Admins need a way to fix or set them.

## Backend

`users.setName` mutation: `{ userId: Id<"users">, name: string }`, admin-only via `requireAdmin`. Trims `name`; rejects empty after trim ("Name cannot be empty") — the feature fixes display names, it does not clear them. Throws "User not found" for a bad id. No schema change (`users.name` already exists).

## Frontend

`src/components/admin/user-roles.tsx`: pencil icon beside each name toggles an inline input pre-filled with the current name. Enter or check button saves via `setName`; Escape cancels; errors toast like role changes. Downstream displays (leaderboard, note names) pick up changes automatically — they resolve names at query time.

## Testing

Convex test: admin renames (trimmed), scout rejected with "Admin only", empty/whitespace name rejected.

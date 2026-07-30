# Admin Edit User Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can rename any user from the admin page's user list.

**Architecture:** One admin-only Convex mutation (`users.setName`) plus inline editing in the existing `UserRoles` admin component. Name consumers (leaderboard, note names) resolve at query time, so no other changes.

**Tech Stack:** Convex mutation + convex-test, React 19 + shadcn Input/Button + sonner toasts.

## Global Constraints

- Run tests with `npm test`, typecheck with `npm run typecheck`. Do NOT run `npm run e2e` without asking the user (wipes/reseeds dev Convex data).
- Convex functions declare `args`/`returns` validators. Reject empty name after trim with exactly "Name cannot be empty"; missing user with "User not found".
- Spec: `docs/superpowers/specs/2026-07-30-admin-edit-names-design.md`.

---

### Task 1: `users.setName` mutation

**Files:**
- Modify: `convex/users.ts` (append mutation)
- Test: `convex/tests/users.test.ts` (append describe block; file already has `createUser`-style helpers — reuse whatever exists there, check its imports first)

**Interfaces:**
- Consumes: `requireAdmin` from `convex/model/authz.ts` (already imported in `users.ts`).
- Produces: `api.users.setName({ userId, name })` → null. Task 2 calls this.

- [ ] **Step 1: Write the failing test**

Open `convex/tests/users.test.ts` and reuse its existing setup helpers (it follows the same `setupTest`/`createUser` pattern as `reports.test.ts`). Append:

```ts
describe("users.setName", () => {
  test("admin renames a user; input is trimmed", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    await t.withIdentity({ subject: adminId }).mutation(api.users.setName, {
      userId: scoutId,
      name: "  Alice  ",
    });

    const scout = await t.run((ctx) => ctx.db.get(scoutId));
    expect(scout?.name).toBe("Alice");
  });

  test("rejects scouts and empty names", async () => {
    const t = setupTest();
    const adminId = await createUser(t, "admin");
    const scoutId = await createUser(t, "scout");

    await expect(
      t.withIdentity({ subject: scoutId }).mutation(api.users.setName, {
        userId: adminId,
        name: "Hacker",
      }),
    ).rejects.toThrow("Admin only");

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.users.setName, {
        userId: scoutId,
        name: "   ",
      }),
    ).rejects.toThrow("Name cannot be empty");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- users`
Expected: FAIL — `api.users.setName` does not exist.

- [ ] **Step 3: Implement the mutation**

Append to `convex/users.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- users`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/users.ts convex/tests/users.test.ts
git commit -m "feat: admin-only users.setName mutation"
```

---

### Task 2: Inline name editing in UserRoles

**Files:**
- Modify: `src/components/admin/user-roles.tsx`

**Interfaces:**
- Consumes: `api.users.setName` (Task 1).

- [ ] **Step 1: Add the inline editor**

Replace the full contents of `src/components/admin/user-roles.tsx` with:

```tsx
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : fallback
}

function EditableName({ userId, name }: { userId: Id<'users'>; name: string | null }) {
  const setName = useMutation(api.users.setName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEditing() {
    setDraft(name ?? '')
    setEditing(true)
  }

  async function save() {
    try {
      await setName({ userId, name: draft })
      setEditing(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update name'))
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm font-medium">{name ?? 'Unnamed user'}</p>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label="Edit name"
          onClick={startEditing}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="h-8"
        aria-label="Name"
      />
      <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label="Save name" onClick={() => void save()}>
        <CheckIcon className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label="Cancel" onClick={() => setEditing(false)}>
        <XIcon className="size-3.5" />
      </Button>
    </div>
  )
}

export function UserRoles() {
  const users = useQuery(api.users.list)
  const setRole = useMutation(api.users.setRole)

  async function handleRoleChange(userId: Id<'users'>, role: string) {
    if (role !== 'admin' && role !== 'scout') return
    try {
      await setRole({ userId, role })
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update role'))
    }
  }

  if (users === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (users.length === 0) {
    return <p className="text-muted-foreground">No users yet.</p>
  }

  return (
    <ul className="space-y-2">
      {users.map((user) => (
        <li
          key={user._id}
          className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
        >
          <div className="min-w-0">
            <EditableName userId={user._id} name={user.name} />
            <p className="truncate text-xs text-muted-foreground">{user.email ?? 'No email'}</p>
          </div>
          <Select
            value={user.role ?? 'scout'}
            onValueChange={(value) => void handleRoleChange(user._id, value as string)}
          >
            <SelectTrigger className="w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scout">Scout</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: both PASS. If dev servers are running, open http://localhost:5173/admin as an admin and rename a user; the new name should appear on /leaderboard immediately.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/user-roles.tsx
git commit -m "feat: inline user-name editing on admin page"
```

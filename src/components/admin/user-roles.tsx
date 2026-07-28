import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function UserRoles() {
  const users = useQuery(api.users.list)
  const setRole = useMutation(api.users.setRole)

  async function handleRoleChange(userId: Id<'users'>, role: string) {
    if (role !== 'admin' && role !== 'scout') return
    try {
      await setRole({ userId, role })
    } catch (err) {
      toast.error(
        err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : 'Could not update role',
      )
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
            <p className="truncate text-sm font-medium">{user.name ?? 'Unnamed user'}</p>
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

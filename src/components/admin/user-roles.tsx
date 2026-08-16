import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
          className="shrink-0"
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
      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Save name" onClick={() => void save()}>
        <CheckIcon className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Cancel" onClick={() => setEditing(false)}>
        <XIcon className="size-3.5" />
      </Button>
    </div>
  )
}

export function UserRoles() {
  const users = useQuery(api.users.list)
  const setRole = useMutation(api.users.setRole)
  const removeUser = useMutation(api.users.remove)
  const [toDelete, setToDelete] = useState<{ _id: Id<'users'>; name: string | null; email: string | null } | null>(null)

  async function handleRoleChange(userId: Id<'users'>, role: string) {
    if (role !== 'admin' && role !== 'scout') return
    try {
      await setRole({ userId, role })
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update role'))
    }
  }

  async function handleDelete() {
    if (!toDelete) return
    try {
      await removeUser({ userId: toDelete._id })
      toast.success('User deleted and email banned')
      setToDelete(null)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete user'))
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
          <div className="flex shrink-0 items-center gap-1.5">
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
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              aria-label="Delete user"
              onClick={() => setToDelete(user)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </li>
      ))}
      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.name ?? toDelete?.email ?? 'this user'}?</DialogTitle>
            <DialogDescription>
              Their account is deleted and {toDelete?.email ? <b>{toDelete.email}</b> : 'their email'} is
              banned from signing up again. Their pit reports and comments are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Delete & ban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ul>
  )
}

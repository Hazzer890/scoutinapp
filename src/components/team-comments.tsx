import { useMutation, useQuery } from 'convex/react'
import { TrashIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import { MAX_COMMENT_LENGTH } from '../../convex/lib/constants'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useIsDesktop } from '@/lib/use-is-desktop'

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function TeamComments({ teamId }: { teamId: Id<'teams'> }) {
  const comments = useQuery(api.comments.listForTeam, { teamId })
  const add = useMutation(api.comments.add)
  const remove = useMutation(api.comments.remove)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const trimmed = text.trim()

  async function handleAdd() {
    if (!trimmed) return
    setSaving(true)
    try {
      await add({ teamId, text: trimmed })
      setText('')
    } catch {
      toast.error('Could not add comment')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(commentId: Id<'teamComments'>) {
    try {
      await remove({ commentId })
    } catch {
      toast.error('Could not delete comment')
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="Leave a quick comment…"
          aria-label="New comment"
        />
        <Button
          type="button"
          size="lg"
          className="h-11 w-full"
          disabled={!trimmed || saving}
          onClick={() => void handleAdd()}
        >
          {saving ? 'Posting…' : 'Post comment'}
        </Button>
      </div>

      {comments === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li key={comment._id} className="rounded-lg border bg-card p-2.5 text-card-foreground">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
                {comment.canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete comment"
                    onClick={() => void handleRemove(comment._id)}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {comment.authorName} · {formatWhen(comment._creationTime)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Standalone comment box for a team — lets a scout leave a note without
 * opening the full pit report form.
 */
export function TeamCommentsDialog({
  teamId,
  title,
  open,
  onOpenChange,
}: {
  teamId: Id<'teams'> | null
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isDesktop = useIsDesktop()
  const body = teamId ? (
    <div className="-mx-4 max-h-[60vh] overflow-y-auto px-4">
      <TeamComments teamId={teamId} />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Team not found.</p>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Comments left by scouts on this team.</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col gap-3 px-4 pb-4">
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Comments left by scouts on this team.</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  )
}

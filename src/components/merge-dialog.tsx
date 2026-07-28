import { useMutation, useQuery } from 'convex/react'
import { AlertTriangleIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import { TierBadge } from '@/components/team-detail'
import type { TeamWithStatus } from '@/components/kanban/team-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function MergeDialog({
  open,
  onOpenChange,
  teams,
  listCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  teams: TeamWithStatus[]
  listCount: number
}) {
  const preview = useQuery(api.picklists.mergePreview, open ? {} : 'skip')
  const applyMerge = useMutation(api.picklists.applyMerge)
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)

  const teamsById = new Map(teams.map((t) => [t._id as string, t]))

  function close(next: boolean) {
    if (!next) setConfirming(false)
    onOpenChange(next)
  }

  async function apply() {
    setApplying(true)
    try {
      await applyMerge({})
      toast.success('Primary list updated from the merge')
      close(false)
    } catch {
      toast.error('Could not apply the merge')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge scout lists</DialogTitle>
          <DialogDescription>
            Consensus ordering across {listCount} scout {listCount === 1 ? 'list' : 'lists'}. Applying
            replaces the primary list.
          </DialogDescription>
        </DialogHeader>

        {preview === undefined ? (
          <p className="text-muted-foreground">Loading preview…</p>
        ) : preview.length === 0 ? (
          <p className="text-muted-foreground">
            No scout has ranked any team yet, so the merge would produce an empty list.
          </p>
        ) : (
          <div className="-mx-1 max-h-[45vh] overflow-y-auto px-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-popover text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1.5 text-left font-medium">Team</th>
                  <th className="py-1.5 text-left font-medium">Tier</th>
                  <th className="py-1.5 text-right font-medium">Score</th>
                  <th className="py-1.5 text-right font-medium">Lists</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => {
                  const team = teamsById.get(row.teamId)
                  return (
                    <tr key={row.teamId} className="border-b last:border-0">
                      <td className="py-1.5">
                        <span className="font-medium tabular-nums">{team?.number ?? '—'}</span>
                        <span className="ml-2 text-muted-foreground">{team?.nickname ?? 'Unknown team'}</span>
                      </td>
                      <td className="py-1.5">
                        <TierBadge tier={row.tier} />
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.score.toFixed(2)}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.lists}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {confirming && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p>
              This overwrites the primary list with {preview?.length ?? 0}{' '}
              {preview?.length === 1 ? 'team' : 'teams'} from the merge. Any manual edits to the
              primary list are lost.
              {listCount === 0 && ' No scout lists exist, so the primary list will be emptied.'}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          {confirming ? (
            <Button variant="destructive" disabled={applying} onClick={() => void apply()}>
              {applying ? 'Applying…' : 'Overwrite primary list'}
            </Button>
          ) : (
            <Button disabled={preview === undefined} onClick={() => setConfirming(true)}>
              Apply to primary
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

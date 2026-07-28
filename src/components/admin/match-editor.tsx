import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Match = FunctionReturnType<typeof api.matches.list>[number]

function msToLocalInput(ms: number | undefined): string {
  if (ms === undefined) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToMs(value: string): number | undefined {
  if (!value) return undefined
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

// A positive integer, per the shared team-number/match-number rule downstream
// consumers (e.g. the match-form route) rely on.
function parsePositiveInt(value: string): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function AllianceInputs({
  label,
  values,
  onChange,
}: {
  label: string
  values: [string, string, string]
  onChange: (values: [string, string, string]) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {values.map((v, i) => (
          <Input
            key={i}
            inputMode="numeric"
            placeholder={`Team ${i + 1}`}
            value={v}
            onChange={(e) => {
              const next = [...values] as [string, string, string]
              next[i] = e.target.value
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function MatchDialog({
  match,
  open,
  onOpenChange,
}: {
  match: Match | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const upsert = useMutation(api.matches.upsertManual)
  const [matchNumber, setMatchNumber] = useState('')
  const [red, setRed] = useState<[string, string, string]>(['', '', ''])
  const [blue, setBlue] = useState<[string, string, string]>(['', '', ''])
  const [scheduledTime, setScheduledTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setMatchNumber(match ? String(match.matchNumber) : '')
    setRed((match?.redTeams.map(String) as [string, string, string]) ?? ['', '', ''])
    setBlue((match?.blueTeams.map(String) as [string, string, string]) ?? ['', '', ''])
    setScheduledTime(msToLocalInput(match?.scheduledTime))
  }, [open, match])

  async function handleSave() {
    const parsedMatchNumber = parsePositiveInt(matchNumber)
    const redTeams = red.map(parsePositiveInt)
    const blueTeams = blue.map(parsePositiveInt)

    if (parsedMatchNumber === null) {
      toast.error('Match number must be a positive integer')
      return
    }
    if (redTeams.some((n) => n === null) || blueTeams.some((n) => n === null)) {
      toast.error('All six team numbers must be positive integers')
      return
    }

    setSaving(true)
    try {
      await upsert({
        matchId: match?._id,
        matchNumber: parsedMatchNumber,
        redTeams: redTeams as number[],
        blueTeams: blueTeams as number[],
        scheduledTime: localInputToMs(scheduledTime),
      })
      toast.success(match ? 'Match updated' : 'Match added')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : 'Could not save match',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{match ? `Edit match ${match.matchNumber}` : 'Add match'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="match-number">Match number</Label>
            <Input
              id="match-number"
              inputMode="numeric"
              value={matchNumber}
              onChange={(e) => setMatchNumber(e.target.value)}
            />
          </div>
          <AllianceInputs label="Red alliance" values={red} onChange={setRed} />
          <AllianceInputs label="Blue alliance" values={blue} onChange={setBlue} />
          <div className="space-y-1.5">
            <Label htmlFor="match-scheduled">Scheduled time (optional)</Label>
            <Input
              id="match-scheduled"
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Clearing this field won&rsquo;t remove an existing scheduled time&mdash;set a new one to
              change it.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteMatchDialog({
  match,
  open,
  onOpenChange,
}: {
  match: Match | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const remove = useMutation(api.matches.remove)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!match) return
    setDeleting(true)
    try {
      await remove({ matchId: match._id })
      toast.success('Match deleted')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : 'Could not delete match',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete match {match?.matchNumber}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MatchEditor() {
  const matches = useQuery(api.matches.list)
  const [editing, setEditing] = useState<Match | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Match | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing(null)}>
          Add match
        </Button>
      </div>

      {matches === undefined ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="text-muted-foreground">No matches yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...matches]
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .map((match) => (
              <li
                key={match._id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold tabular-nums">Q{match.matchNumber}</span>
                  <span className="text-red-600 dark:text-red-400">{match.redTeams.join(' ')}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span className="text-blue-600 dark:text-blue-400">{match.blueTeams.join(' ')}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(match)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleting(match)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      )}

      <MatchDialog
        match={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined)
        }}
      />
      <DeleteMatchDialog
        match={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}

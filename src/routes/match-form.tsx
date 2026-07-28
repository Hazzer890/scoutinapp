import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { PRESET_TAGS } from '../../convex/lib/constants'
import { Stepper } from '@/components/stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function ToggleCard({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between rounded-lg border p-4 text-left text-base font-medium transition-colors',
        checked ? 'border-primary bg-primary/10' : 'border-border bg-card',
      )}
    >
      {label}
      <span
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

function TagChip({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'default' : 'outline'}
      size="sm"
      className="rounded-full"
      onClick={onToggle}
    >
      {label}
    </Button>
  )
}

function MatchForm({
  matchNumber,
  teamNumber,
  teamId,
  matchId,
}: {
  matchNumber: number
  teamNumber: number
  teamId: Id<'teams'>
  matchId?: Id<'matches'>
}) {
  const submit = useMutation(api.matchReports.submit)
  const navigate = useNavigate()

  const [ballsScored, setBallsScored] = useState(0)
  const [ballsMissed, setBallsMissed] = useState(0)
  const [maxStorage, setMaxStorage] = useState(0)
  const [climbAttempted, setClimbAttempted] = useState(false)
  const [climbSucceeded, setClimbSucceeded] = useState(false)
  const [playedDefense, setPlayedDefense] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const customTags = tags.filter((tag) => !PRESET_TAGS.includes(tag))

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function addCustomTag() {
    const tag = customTag.trim()
    if (!tag || tags.includes(tag)) return
    setTags((prev) => [...prev, tag])
    setCustomTag('')
  }

  function handleSubmit() {
    setSubmitting(true)
    submit({
      teamId,
      matchNumber,
      matchId,
      ballsScored,
      ballsMissed,
      maxStorage,
      climbAttempted,
      climbSucceeded: climbAttempted && climbSucceeded,
      playedDefense,
      tags,
      notes: notes.trim() || undefined,
    })
      .then(() => {
        toast.success('Match report saved')
        navigate('/matches')
      })
      .catch(() => {
        toast.error('Could not save match report')
        setSubmitting(false)
      })
  }

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-semibold">
        Q{matchNumber} · Team {teamNumber}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stepper label="Balls scored" value={ballsScored} onChange={setBallsScored} min={0} />
        <Stepper label="Balls missed" value={ballsMissed} onChange={setBallsMissed} min={0} />
        <Stepper label="Max balls held" value={maxStorage} onChange={setMaxStorage} min={0} />
      </div>

      <div className="space-y-3">
        <ToggleCard
          label="Attempted climb"
          checked={climbAttempted}
          onChange={(value) => {
            setClimbAttempted(value)
            if (!value) setClimbSucceeded(false)
          }}
        />
        {climbAttempted && (
          <ToggleCard
            label="Climb succeeded"
            checked={climbSucceeded}
            onChange={setClimbSucceeded}
          />
        )}
        <ToggleCard label="Played defense" checked={playedDefense} onChange={setPlayedDefense} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Tags</h2>
        <div className="flex flex-wrap gap-2">
          {PRESET_TAGS.map((tag) => (
            <TagChip key={tag} label={tag} selected={tags.includes(tag)} onToggle={() => toggleTag(tag)} />
          ))}
          {customTags.map((tag) => (
            <TagChip key={tag} label={tag} selected onToggle={() => toggleTag(tag)} />
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Add a tag"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomTag()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addCustomTag}>
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <Button className="w-full" size="lg" disabled={submitting} onClick={handleSubmit}>
          Submit
        </Button>
      </div>
    </div>
  )
}

function MatchFormContainer() {
  const { matchNumber: matchNumberParam, teamNumber: teamNumberParam } = useParams()
  const location = useLocation()
  const teams = useQuery(api.teams.list)
  const matches = useQuery(api.matches.list)

  const matchNumber = Number(matchNumberParam)
  const teamNumber = Number(teamNumberParam)

  if (!Number.isFinite(matchNumber) || !Number.isFinite(teamNumber)) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">Invalid match or team number.</p>
        <Link to="/matches" className="underline">
          Back to matches
        </Link>
      </div>
    )
  }

  if (teams === undefined || matches === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }

  const team = teams.find((t) => t.number === teamNumber)
  if (!team) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">No team #{teamNumber} found for the active event.</p>
        <Link to="/matches" className="underline">
          Back to matches
        </Link>
      </div>
    )
  }

  const match = matches.find((m) => m.matchNumber === matchNumber)
  const state = location.state as { matchId?: Id<'matches'> } | null
  const matchId = state?.matchId ?? match?._id

  return (
    <MatchForm matchNumber={matchNumber} teamNumber={teamNumber} teamId={team._id} matchId={matchId} />
  )
}

export function MatchFormPage() {
  return (
    <div className="space-y-2">
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          You are not signed in.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <MatchFormContainer />
      </Authenticated>
    </div>
  )
}

import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { CheckIcon } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-14 w-full items-center justify-between rounded-lg border px-4 text-base font-medium transition-colors',
        checked ? 'border-primary bg-primary/10' : 'border-input bg-background hover:bg-muted',
      )}
    >
      {label}
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked && <CheckIcon className="size-4" />}
      </span>
    </button>
  )
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cn(
              'h-12 rounded-lg border text-base font-semibold tabular-nums transition-colors',
              value === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:bg-muted',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function TagChips({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [newTag, setNewTag] = useState('')
  const options = Array.from(new Set([...PRESET_TAGS, ...tags]))

  function toggle(tag: string) {
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])
  }

  function addCustom() {
    const trimmed = newTag.trim()
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed])
    setNewTag('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tags.includes(tag)}
            onClick={() => toggle(tag)}
            className={cn(
              'h-11 rounded-full border px-3.5 text-sm font-medium transition-colors',
              tags.includes(tag)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:bg-muted',
            )}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add a tag"
          className="h-11"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
        />
        <Button type="button" variant="outline" className="h-11 px-4" onClick={addCustom}>
          Add
        </Button>
      </div>
    </div>
  )
}

function PitForm({ teamId }: { teamId: Id<'teams'> }) {
  const navigate = useNavigate()
  const team = useQuery(api.teams.get, { teamId })
  const existing = useQuery(api.pitReports.getForTeam, { teamId })
  const generateUploadUrl = useMutation(api.pitReports.generateUploadUrl)
  const submit = useMutation(api.pitReports.submit)

  const [initialized, setInitialized] = useState(false)
  const [canScoreBalls, setCanScoreBalls] = useState(false)
  const [canClimb, setCanClimb] = useState(false)
  const [storageCapacity, setStorageCapacity] = useState(0)
  const [driverRating, setDriverRating] = useState(5)
  const [defenseRating, setDefenseRating] = useState(5)
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [photoId, setPhotoId] = useState<Id<'_storage'> | undefined>(undefined)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (existing === undefined || initialized) return
    if (existing) {
      setCanScoreBalls(existing.canScoreBalls)
      setCanClimb(existing.canClimb)
      setStorageCapacity(existing.storageCapacity ?? 0)
      setDriverRating(existing.driverRating)
      setDefenseRating(existing.defenseRating)
      setTags(existing.tags)
      setNotes(existing.notes ?? '')
      setPhotoId(existing.photoId)
      setPhotoPreview(existing.photoUrl)
    }
    setInitialized(true)
  }, [existing, initialized])

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const uploadUrl = await generateUploadUrl({})
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!res.ok) throw new Error('Upload failed')
      const { storageId } = (await res.json()) as { storageId?: Id<'_storage'> }
      if (!storageId) throw new Error('Upload failed')
      setPhotoId(storageId)
      setPhotoPreview(URL.createObjectURL(file))
    } catch {
      toast.error('Photo upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await submit({
        teamId,
        canScoreBalls,
        canClimb,
        storageCapacity,
        driverRating,
        defenseRating,
        tags,
        photoId,
        notes: notes.trim() || undefined,
      })
      toast.success('Pit report saved')
      navigate('/pit')
    } catch {
      toast.error('Could not save pit report')
      setSubmitting(false)
    }
  }

  if (team === undefined || existing === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (team === null) {
    return <p className="text-muted-foreground">Team not found.</p>
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <Link to="/pit" className="text-sm text-muted-foreground underline">
          Back to teams
        </Link>
        <h1 className="text-2xl font-semibold">
          {team.number} <span className="text-muted-foreground">{team.nickname}</span>
        </h1>
      </div>

      <div className="space-y-2">
        <ToggleCard label="Can score balls" checked={canScoreBalls} onChange={setCanScoreBalls} />
        <ToggleCard label="Can climb" checked={canClimb} onChange={setCanClimb} />
      </div>

      <Stepper
        label="Storage capacity"
        value={storageCapacity}
        onChange={setStorageCapacity}
        min={0}
      />

      <RatingRow label="Driver rating" value={driverRating} onChange={setDriverRating} />
      <RatingRow label="Defense rating" value={defenseRating} onChange={setDefenseRating} />

      <div className="space-y-2">
        <span className="text-sm font-medium text-muted-foreground">Tags</span>
        <TagChips tags={tags} onChange={setTags} />
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-muted-foreground">Photo</span>
        {photoPreview && (
          <img
            src={photoPreview}
            alt="Robot"
            className="h-40 w-full rounded-lg border object-cover"
          />
        )}
        <label className="flex h-12 w-full cursor-pointer items-center justify-center rounded-lg border border-input text-sm font-medium hover:bg-muted">
          {uploading ? 'Uploading…' : photoPreview ? 'Replace photo' : 'Add photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={uploading}
            onChange={handlePhotoChange}
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-muted-foreground">Notes</span>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else worth noting…"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-4">
        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={submitting || uploading}
          onClick={() => void handleSubmit()}
        >
          {submitting ? 'Saving…' : 'Submit'}
        </Button>
      </div>
    </div>
  )
}

export function PitFormPage() {
  const { teamId } = useParams<{ teamId: string }>()

  return (
    <>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to view pit scouting.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <PitForm teamId={teamId as Id<'teams'>} />
      </Authenticated>
    </>
  )
}

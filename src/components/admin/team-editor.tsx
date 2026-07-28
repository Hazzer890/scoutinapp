import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
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

type Team = FunctionReturnType<typeof api.teams.list>[number]

function TeamDialog({
  team,
  open,
  onOpenChange,
}: {
  team: Team | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const upsert = useMutation(api.teams.upsertManual)
  const [number, setNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [stateProv, setStateProv] = useState('')
  const [country, setCountry] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNumber(team ? String(team.number) : '')
    setNickname(team?.nickname ?? '')
    setCity(team?.city ?? '')
    setStateProv(team?.stateProv ?? '')
    setCountry(team?.country ?? '')
  }, [open, team])

  async function handleSave() {
    const num = Number(number)
    if (!Number.isInteger(num) || num <= 0) {
      toast.error('Team number must be a positive integer')
      return
    }
    if (!nickname.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      await upsert({
        teamId: team?._id,
        number: num,
        nickname: nickname.trim(),
        city: city.trim() || undefined,
        stateProv: stateProv.trim() || undefined,
        country: country.trim() || undefined,
      })
      toast.success(team ? 'Team updated' : 'Team added')
      onOpenChange(false)
    } catch {
      toast.error('Could not save team')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team ? `Edit team ${team.number}` : 'Add team'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-number">Number</Label>
            <Input
              id="team-number"
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-nickname">Name</Label>
            <Input id="team-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-city">City</Label>
            <Input id="team-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="team-state">State/Province</Label>
              <Input id="team-state" value={stateProv} onChange={(e) => setStateProv(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-country">Country</Label>
              <Input id="team-country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
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

function DeleteTeamDialog({
  team,
  open,
  onOpenChange,
}: {
  team: Team | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const remove = useMutation(api.teams.remove)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!team) return
    setDeleting(true)
    try {
      await remove({ teamId: team._id })
      toast.success('Team deleted')
      onOpenChange(false)
    } catch {
      toast.error('Could not delete team')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete team {team?.number}?</DialogTitle>
          <DialogDescription>
            This also deletes all pit reports, match reports, and picklist entries for this team.
            This cannot be undone.
          </DialogDescription>
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

export function TeamEditor() {
  const teams = useQuery(api.teams.list)
  const [editing, setEditing] = useState<Team | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Team | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing(null)}>
          Add team
        </Button>
      </div>

      {teams === undefined ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="text-muted-foreground">No teams yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...teams]
            .sort((a, b) => a.number - b.number)
            .map((team) => (
              <li
                key={team._id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
              >
                <div>
                  <span className="font-semibold tabular-nums">{team.number}</span>{' '}
                  <span className="text-sm">{team.nickname}</span>
                  {(team.city || team.stateProv || team.country) && (
                    <p className="text-xs text-muted-foreground">
                      {[team.city, team.stateProv, team.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(team)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleting(team)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      )}

      <TeamDialog
        team={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined)
        }}
      />
      <DeleteTeamDialog
        team={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}

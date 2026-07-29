import { useQuery } from 'convex/react'
import { useSyncExternalStore } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type TeamWithStatus = FunctionReturnType<typeof api.teams.listWithStatus>[number]

const TIER_STYLES: Record<string, string> = {
  S: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  A: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  B: 'bg-green-500/15 text-green-700 dark:text-green-300',
  C: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  D: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  DNP: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export function TierBadge({ tier, label }: { tier: string | null | undefined; label?: string }) {
  if (!tier) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TIER_STYLES[tier] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {label ? `${label} ` : ''}
      {tier}
    </span>
  )
}

export function PitStatusBadge({ scouted }: { scouted: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        scouted ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground',
      )}
    >
      {scouted ? 'Scouted' : 'Not Scouted'}
    </span>
  )
}

// ponytail: matches the sm breakpoint used elsewhere; bump if the Tailwind config's screen changes.
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia('(min-width: 640px)')
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(min-width: 640px)').matches,
  )
}

function TeamDetailBody({ team, isAdmin }: { team: TeamWithStatus; isAdmin: boolean }) {
  const stats = useQuery(api.stats.forTeam, { teamId: team._id })
  const pitReport = useQuery(api.pitReports.getForTeam, { teamId: team._id })

  const location = [team.city, team.stateProv, team.country].filter(Boolean).join(', ')

  return (
    <>
      <div className={cn('flex flex-col gap-0.5')} data-slot="team-detail-header">
        <p className="font-heading text-base font-medium">
          #{team.number} — {team.nickname}
        </p>
        <p className="text-sm text-muted-foreground">{location || 'Location not available'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PitStatusBadge scouted={team.pitScouted} />
        <TierBadge tier={team.personalTier} />
        {isAdmin && team.primaryTier && team.primaryTier !== team.personalTier && (
          <TierBadge tier={team.primaryTier} label="Primary:" />
        )}
      </div>

      <div className="-mx-4 max-h-[60vh] overflow-y-auto px-4">
        <div className="space-y-4 pb-2">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Stats</h3>
            {stats === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : stats === null ? (
              <p className="text-sm text-muted-foreground">No ball estimate yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label="Balls / match" value={String(stats.ballsPerMatch)} />
                <Stat
                  label="% of benchmark"
                  value={stats.pctOfBenchmark === null ? '—' : `${stats.pctOfBenchmark.toFixed(0)}%`}
                />
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Pit scouting</h3>
            {pitReport === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pitReport === null ? (
              <p className="text-sm text-muted-foreground">Not scouted yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {pitReport.photoUrl && (
                  <img
                    src={pitReport.photoUrl}
                    alt={`${team.nickname} robot`}
                    className="max-h-48 w-full rounded-md object-cover"
                  />
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>{pitReport.canScoreBalls ? 'Scores balls' : 'Cannot score balls'}</span>
                  <span>{pitReport.canClimb ? 'Can climb' : 'Cannot climb'}</span>
                  {pitReport.storageCapacity !== undefined && <span>Storage: {pitReport.storageCapacity}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Driver rating: {pitReport.driverRating}</span>
                  <span>Defense rating: {pitReport.defenseRating}</span>
                </div>
                <p className="text-muted-foreground">
                  {pitReport.hasAuto
                    ? [
                        `Auto: ${pitReport.autoBalls ?? 0} balls`,
                        pitReport.autoSide &&
                          `prefers ${pitReport.autoSide}/${pitReport.autoDepth ?? 'close'}`,
                        pitReport.autoClimb && 'climbs in auto',
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : 'No auto'}
                </p>
                {pitReport.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pitReport.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {pitReport.notes && <p>{pitReport.notes}</p>}
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-2 text-card-foreground">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  )
}

export function TeamDetail({
  team,
  loading,
  isAdmin,
  open,
  onOpenChange,
}: {
  team: TeamWithStatus | null
  loading: boolean
  isAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isDesktop = useIsDesktop()
  const body = loading ? (
    <p className="text-sm text-muted-foreground">Loading…</p>
  ) : team ? (
    <TeamDetailBody team={team} isAdmin={isAdmin} />
  ) : (
    <p className="text-sm text-muted-foreground">Team not found.</p>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{team ? `#${team.number} — ${team.nickname}` : 'Team detail'}</DialogTitle>
            <DialogDescription>Scouting report and stats for this team.</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col gap-3 px-4 pb-4">
        <SheetHeader className="sr-only p-0">
          <SheetTitle>{team ? `#${team.number} — ${team.nickname}` : 'Team detail'}</SheetTitle>
          <SheetDescription>Scouting report and stats for this team.</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  )
}

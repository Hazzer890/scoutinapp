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

function pct(value: number | null, digits = 0) {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`
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
  const matchReports = useQuery(api.matchReports.listForTeam, { teamId: team._id })

  const location = [team.city, team.stateProv, team.country].filter(Boolean).join(', ')
  const sortedMatches = matchReports ? [...matchReports].sort((a, b) => a.matchNumber - b.matchNumber) : undefined

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
            <h3 className="text-sm font-medium">Match stats</h3>
            {stats === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : stats === null ? (
              <p className="text-sm text-muted-foreground">No match reports yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Stat label="Matches" value={String(stats.matchCount)} />
                <Stat label="Avg balls" value={stats.avgBalls.toFixed(1)} />
                <Stat label="Accuracy" value={pct(stats.accuracy)} />
                <Stat
                  label={stats.throughputPctOfBenchmark === null ? 'Throughput' : '% of benchmark'}
                  value={
                    stats.throughputPctOfBenchmark === null
                      ? `${stats.throughputBps.toFixed(2)} balls/s`
                      : `${stats.throughputPctOfBenchmark.toFixed(0)}%`
                  }
                />
                <Stat label="Avg storage" value={stats.avgStorage.toFixed(1)} />
                <Stat label="Climb rate" value={pct(stats.climbSuccessRate)} />
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

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Match reports</h3>
            {sortedMatches === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : sortedMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No match reports yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedMatches.map((report) => (
                  <div key={report._id} className="rounded-lg border bg-card p-2.5 text-sm text-card-foreground">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Match {report.matchNumber}</span>
                      <span className="text-xs text-muted-foreground">{report.scoutName ?? 'Unknown scout'}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {report.ballsScored} scored / {report.ballsMissed} missed
                      </span>
                      <span>Storage: {report.maxStorage}</span>
                      {report.climbAttempted && <span>{report.climbSucceeded ? 'Climbed' : 'Climb failed'}</span>}
                      {report.playedDefense && <span>Played defense</span>}
                    </div>
                    {report.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {report.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {report.notes && <p className="mt-1 text-xs">{report.notes}</p>}
                  </div>
                ))}
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
            <DialogDescription>Pit scouting, match reports, and stats for this team.</DialogDescription>
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
          <SheetDescription>Pit scouting, match reports, and stats for this team.</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  )
}

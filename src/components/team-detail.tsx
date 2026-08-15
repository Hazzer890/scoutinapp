import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { TeamComments } from '@/components/team-comments'
import { useIsDesktop } from '@/lib/use-is-desktop'
import { WatchButton } from '@/components/watch-button'
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

export function PitStatusBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        count > 0 ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground',
      )}
    >
      {count > 0 ? `${count} scout${count === 1 ? '' : 's'}` : 'Not Scouted'}
    </span>
  )
}

function TeamDetailBody({ team, isAdmin }: { team: TeamWithStatus; isAdmin: boolean }) {
  const stats = useQuery(api.stats.forTeam, { teamId: team._id })
  const agg = useQuery(api.pitReports.aggregateForTeam, { teamId: team._id })

  const location = [team.city, team.stateProv, team.country].filter(Boolean).join(', ')

  return (
    <>
      <div className={cn('flex flex-col gap-0.5')} data-slot="team-detail-header">
        {/* pr-10 keeps the title clear of the dialog/sheet close button. */}
        <p className="font-heading text-base font-medium pr-10">
          #{team.number} — {team.nickname}
        </p>
        <p className="text-sm text-muted-foreground">{location || 'Location not available'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <WatchButton
          teamId={team._id}
          watched={team.watchedByMe}
          label={`team ${team.number}`}
          variant="pill"
        />
        <PitStatusBadge count={team.scoutCount} />
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
            <h3 className="text-sm font-medium">
              Pit scouting{agg ? ` (${agg.scoutCount} scout${agg.scoutCount === 1 ? '' : 's'})` : ''}
            </h3>
            {agg === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : agg === null ? (
              <p className="text-sm text-muted-foreground">Not scouted yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {agg.photoUrl && (
                  <img
                    src={agg.photoUrl}
                    alt={`${team.nickname} robot`}
                    className="max-h-48 w-full rounded-md object-cover"
                  />
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <BoolRow label="scores balls" yes={agg.canScoreBalls.yes} total={agg.canScoreBalls.total} />
                  <BoolRow label="climbs" yes={agg.canClimb.yes} total={agg.canClimb.total} />
                  {agg.storageCapacity !== null && <span>Storage: {agg.storageCapacity}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {agg.driverRating !== null && <span>Driver rating: {agg.driverRating}</span>}
                  {agg.defenseRating !== null && <span>Defense rating: {agg.defenseRating}</span>}
                </div>
                <p className="text-muted-foreground">
                  {agg.hasAuto.yes > 0
                    ? [
                        `Auto (${agg.hasAuto.yes}/${agg.hasAuto.total}): ${agg.autoBalls ?? 0} balls`,
                        agg.autoSide && `prefers ${agg.autoSide.value}/${agg.autoDepth?.value ?? 'close'}`,
                        agg.autoClimb.yes > 0 && `${agg.autoClimb.yes}/${agg.autoClimb.total} climb in auto`,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : 'No auto'}
                </p>
                {agg.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {agg.tags.map(({ tag, count }) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {tag}
                        {count > 1 && <span className="text-muted-foreground"> ×{count}</span>}
                      </span>
                    ))}
                  </div>
                )}
                {agg.notes.map(({ scoutName, note }, i) => (
                  <p key={i}>
                    <span className="font-medium">{scoutName}:</span> {note}
                  </p>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Comments</h3>
            <TeamComments teamId={team._id} />
          </section>
        </div>
      </div>
    </>
  )
}

function BoolRow({ label, yes, total }: { label: string; yes: number; total: number }) {
  return (
    <span>
      {yes}/{total} say {label}
    </span>
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

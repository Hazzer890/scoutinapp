import type { FunctionReturnType } from 'convex/server'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { S_TIER_MAX, TIERS, type Tier } from '../../../convex/lib/constants'
import type { PicklistEntry } from '@/components/picklist/types'
import { TIER_DOTS, TIER_SOLIDS } from '@/components/picklist/types'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type TeamWithStatus = FunctionReturnType<typeof api.teams.listWithStatus>[number]
export type TeamStats = FunctionReturnType<typeof api.stats.forEvent>[string]

const TIER_LABELS: Record<Tier, string> = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  DNP: 'Do Not Pick',
}

function StatLine({ stats }: { stats: TeamStats | undefined }) {
  if (!stats) return null
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {stats.ballsPerMatch} balls
      {stats.pctOfBenchmark !== null && ` · ${stats.pctOfBenchmark.toFixed(0)}%`}
    </span>
  )
}

function Row({
  team,
  stats,
  tier,
  first,
  last,
  readOnly,
  onOpen,
  onMove,
}: {
  team: TeamWithStatus
  stats: TeamStats | undefined
  tier: Tier | null
  first: boolean
  last: boolean
  readOnly: boolean
  onOpen: () => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5 text-card-foreground">
      <span className="w-12 shrink-0 text-base font-semibold tabular-nums">{team.number}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-muted-foreground">{team.nickname}</span>
        <StatLine stats={stats} />
      </div>
      <button
        type="button"
        aria-label={`Set tier for ${team.number}`}
        disabled={readOnly}
        onClick={onOpen}
        className={cn(
          'h-9 min-w-11 shrink-0 rounded-full px-3 text-sm font-bold',
          tier
            ? cn('text-white', TIER_SOLIDS[tier])
            : 'border border-dashed border-muted-foreground/50 text-muted-foreground',
          !readOnly && 'active:scale-95',
        )}
      >
        {tier ?? <PlusIcon className="mx-auto size-4" />}
      </button>
      {tier && !readOnly && (
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            aria-label={`Move ${team.number} up`}
            disabled={first}
            onClick={() => onMove(-1)}
            className="flex h-5 w-8 items-center justify-center rounded border text-muted-foreground disabled:opacity-30"
          >
            <ChevronUpIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move ${team.number} down`}
            disabled={last}
            onClick={() => onMove(1)}
            className="flex h-5 w-8 items-center justify-center rounded border text-muted-foreground disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export function TierList({
  entries,
  teams,
  stats,
  readOnly = false,
  onMove,
}: {
  entries: PicklistEntry[]
  teams: TeamWithStatus[]
  stats: Record<string, TeamStats>
  readOnly?: boolean
  onMove: (teamId: Id<'teams'>, tier: Tier | null, rank: number) => void
}) {
  const [sheetTeam, setSheetTeam] = useState<TeamWithStatus | null>(null)

  const byId = new Map(teams.map((t) => [t._id as string, t]))
  const placed = new Set(entries.map((e) => e.teamId as string))
  const groups = TIERS.map((tier) => ({
    tier,
    teams: entries
      .filter((e) => e.tier === tier)
      .sort((a, b) => a.rank - b.rank)
      .map((e) => byId.get(e.teamId))
      .filter((t): t is TeamWithStatus => t !== undefined),
  }))
  const unranked = teams.filter((t) => !placed.has(t._id)).sort((a, b) => a.number - b.number)

  const sheetTier = sheetTeam
    ? (entries.find((e) => e.teamId === sheetTeam._id)?.tier ?? null)
    : null
  const sFull = groups[0].teams.length >= S_TIER_MAX

  function assign(tier: Tier | null) {
    if (!sheetTeam) return
    // Rank is clamped server-side, so a big number means "append to the tier".
    onMove(sheetTeam._id, tier, 9999)
    setSheetTeam(null)
  }

  return (
    <div className="space-y-1">
      {[...groups, { tier: null as Tier | null, teams: unranked }].map(({ tier, teams: group }) => {
        if (group.length === 0 && tier !== 'S' && tier !== null) return null
        return (
          <section key={tier ?? 'unranked'} aria-label={tier ?? 'Unranked'} className="space-y-2 pb-3">
            <h2 className="flex items-center gap-2 px-1 text-xs font-bold tracking-wider text-muted-foreground">
              <span
                className={cn('size-2 rounded-full', tier ? TIER_DOTS[tier] : 'bg-muted-foreground/40')}
                aria-hidden
              />
              {tier ? TIER_LABELS[tier].toUpperCase() : 'UNRANKED'}
              {tier === 'S' && <span className="font-normal">({S_TIER_MAX} max)</span>}
            </h2>
            {group.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                Empty
              </p>
            ) : (
              group.map((team, i) => (
                <Row
                  key={team._id}
                  team={team}
                  stats={stats[team._id]}
                  tier={tier}
                  first={i === 0}
                  last={i === group.length - 1}
                  readOnly={readOnly}
                  onOpen={() => setSheetTeam(team)}
                  onMove={(dir) => tier && onMove(team._id, tier, i + dir)}
                />
              ))
            )}
          </section>
        )
      })}

      <Sheet open={sheetTeam !== null} onOpenChange={(open) => !open && setSheetTeam(null)}>
        <SheetContent side="bottom" className="pb-6">
          <SheetHeader>
            <SheetTitle>
              {sheetTeam ? `${sheetTeam.number} — ${sheetTeam.nickname}` : ''}
            </SheetTitle>
            <SheetDescription>Pick a tier for this team.</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {TIERS.map((tier) => {
              const disabled = tier === 'S' && sFull && sheetTier !== 'S'
              return (
                <button
                  key={tier}
                  type="button"
                  aria-label={`Move to ${tier}`}
                  disabled={disabled}
                  onClick={() => assign(tier)}
                  className={cn(
                    'h-12 rounded-lg text-base font-bold text-white active:scale-95 disabled:opacity-40',
                    TIER_SOLIDS[tier],
                    sheetTier === tier && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                  )}
                >
                  {tier === 'S' && sFull && sheetTier !== 'S' ? 'S full' : tier}
                </button>
              )
            })}
          </div>
          {sheetTier && (
            <div className="px-4 pt-2">
              <Button variant="outline" className="w-full" onClick={() => assign(null)}>
                Remove from list
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

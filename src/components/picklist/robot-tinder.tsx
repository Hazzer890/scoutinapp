import { useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { S_TIER_MAX, TIERS, type Tier } from '../../../convex/lib/constants'
import type { PicklistEntry } from '@/components/picklist/types'
import { TIER_SOLIDS } from '@/components/picklist/types'
import type { TeamStats, TeamWithStatus } from '@/components/picklist/tier-list'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function RobotTinder({
  entries,
  teams,
  stats,
  onAssign,
}: {
  entries: PicklistEntry[]
  teams: TeamWithStatus[]
  stats: Record<string, TeamStats>
  onAssign: (teamId: Id<'teams'>, tier: Tier) => void
}) {
  // Skipped teams rotate to the back of the queue; ranked teams drop out reactively.
  const [skipped, setSkipped] = useState<string[]>([])

  const placed = new Set(entries.map((e) => e.teamId as string))
  const unranked = teams.filter((t) => !placed.has(t._id)).sort((a, b) => a.number - b.number)
  const queue = [
    ...unranked.filter((t) => !skipped.includes(t._id)),
    ...skipped.map((id) => unranked.find((t) => t._id === id)).filter((t) => t !== undefined),
  ]
  const current = queue[0]
  const sFull = entries.filter((e) => e.tier === 'S').length >= S_TIER_MAX

  if (!current) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <p className="text-3xl">🎉</p>
        <p className="mt-2 font-medium text-foreground">Every robot has been judged.</p>
        <p className="mt-1 text-sm">Switch to your list to fine-tune the order.</p>
      </div>
    )
  }

  const teamStats = stats[current._id]

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5">
      <div className="relative pt-6">
        {queue.length > 2 && (
          <div className="absolute inset-x-8 top-0 h-10 rounded-2xl border bg-card opacity-30" aria-hidden />
        )}
        {queue.length > 1 && (
          <div className="absolute inset-x-4 top-3 h-10 rounded-2xl border bg-card opacity-60" aria-hidden />
        )}
        <div className="relative rounded-2xl border bg-card p-6 text-center text-card-foreground shadow-lg">
          <p className="text-5xl font-extrabold tabular-nums">{current.number}</p>
          <p className="mt-1 truncate text-muted-foreground">{current.nickname}</p>
          <div className="mt-4 flex justify-center gap-8 text-sm">
            <div>
              <p className="text-xl font-semibold tabular-nums">{teamStats?.ballsPerMatch ?? '—'}</p>
              <p className="text-xs text-muted-foreground">balls / match</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {teamStats?.pctOfBenchmark != null ? `${teamStats.pctOfBenchmark.toFixed(0)}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">of benchmark</p>
            </div>
          </div>
          {!current.pitScouted && (
            <p className="mt-3 text-xs text-muted-foreground italic">Not scouted yet</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            aria-label={`File ${current.number} into ${tier}`}
            disabled={tier === 'S' && sFull}
            onClick={() => onAssign(current._id, tier)}
            className={cn(
              'h-13 rounded-xl text-sm font-extrabold text-white active:scale-95 disabled:opacity-40',
              TIER_SOLIDS[tier],
            )}
          >
            {tier}
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        className="bg-background"
        onClick={() =>
          setSkipped((prev) => [...prev.filter((id) => id !== current._id), current._id])
        }
      >
        Skip
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {queue.length} robot{queue.length === 1 ? '' : 's'} left to judge
      </p>
    </div>
  )
}

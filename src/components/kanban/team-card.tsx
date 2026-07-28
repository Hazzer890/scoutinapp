import type { FunctionReturnType } from 'convex/server'
import { GripVerticalIcon } from 'lucide-react'
import type { api } from '../../../convex/_generated/api'
import { PitStatusBadge } from '@/components/team-detail'
import { cn } from '@/lib/utils'

export type TeamWithStatus = FunctionReturnType<typeof api.teams.listWithStatus>[number]
export type TeamStats = FunctionReturnType<typeof api.stats.forEvent>[string]

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] leading-tight text-muted-foreground uppercase">{label}</p>
      <p className="truncate text-xs font-medium tabular-nums">{value}</p>
    </div>
  )
}

export function TeamCard({
  team,
  stats,
  dragging,
  overlay,
  className,
}: {
  team: TeamWithStatus
  stats: TeamStats | undefined
  dragging?: boolean
  overlay?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-2.5 text-card-foreground shadow-xs transition-shadow',
        dragging && 'opacity-40',
        overlay && 'rotate-1 shadow-lg ring-2 ring-primary',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
        <span className="text-base leading-none font-semibold tabular-nums">{team.number}</span>
        <span className="ml-auto shrink-0">
          <PitStatusBadge scouted={team.pitScouted} />
        </span>
      </div>
      <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{team.nickname}</p>

      {stats === undefined ? (
        <p className="mt-2 pl-6 text-[11px] text-muted-foreground italic">No match data</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1.5 pl-6">
          <Metric label="Balls" value={stats.avgBalls.toFixed(1)} />
          <Metric
            label="Acc"
            value={stats.accuracy === null ? '—' : `${(stats.accuracy * 100).toFixed(0)}%`}
          />
          <Metric
            label={stats.throughputPctOfBenchmark === null ? 'Thru' : '% 4788'}
            value={
              stats.throughputPctOfBenchmark === null
                ? `${stats.throughputBps.toFixed(2)}/s`
                : `${stats.throughputPctOfBenchmark.toFixed(0)}%`
            }
          />
        </div>
      )}
    </div>
  )
}

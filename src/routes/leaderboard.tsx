import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'
import { cn } from '@/lib/utils'

const MEDAL_STYLES = [
  'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300', // gold
  'bg-slate-400/20 text-slate-600 dark:text-slate-300', // silver
  'bg-orange-500/20 text-orange-700 dark:text-orange-300', // bronze
]

function Leaderboard() {
  const board = useQuery(api.pitReports.leaderboard)
  const me = useQuery(api.users.me)

  if (board === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (board.length === 0) {
    return (
      <p className="text-muted-foreground">
        No reports yet.{' '}
        <Link to="/scout" className="underline">
          Go scout some teams!
        </Link>
      </p>
    )
  }

  return (
    <ol className="space-y-2">
      {board.map((entry, i) => (
        <li
          key={entry.scoutId}
          className={cn(
            'flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground',
            entry.scoutId === me?._id && 'border-primary',
          )}
        >
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
              MEDAL_STYLES[i] ?? 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className="flex-1 truncate font-medium">
            {entry.scoutName}
            {entry.scoutId === me?._id && <span className="text-muted-foreground"> (you)</span>}
          </span>
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{entry.count}</span>{' '}
            team{entry.count === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function LeaderboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scout Leaderboard</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to see the leaderboard.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <Leaderboard />
      </Authenticated>
    </div>
  )
}

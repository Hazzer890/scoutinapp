import { Authenticated, AuthLoading, Unauthenticated, useAction, useQuery } from 'convex/react'
import { RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { FunctionReturnType } from 'convex/server'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { TierBadge } from '@/components/team-detail'
import { WatchButton } from '@/components/watch-button'
import { cn } from '@/lib/utils'

type Upcoming = FunctionReturnType<typeof api.matches.upcoming>
type UpcomingMatch = Upcoming['matches'][number]
type AllianceTeam = UpcomingMatch['red'][number]

const FOLLOWING_COUNT = 5
// TBA revises predicted times as an event drifts; anything older than this gets
// a background pull when the page is opened.
const STALE_AFTER_MS = 2 * 60 * 1000

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatRelative(ms: number, now: number): string {
  const minutes = Math.round((ms - now) / 60000)
  if (minutes <= -60) return `${Math.round(-minutes / 60)}h ago`
  if (minutes < 0) return `${-minutes} min ago`
  if (minutes === 0) return 'now'
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `in ${hours}h ${minutes % 60}m`
}

// Re-renders on a slow tick so the countdowns stay honest without a query.
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function MatchTime({ match, now }: { match: UpcomingMatch; now: number }) {
  if (match.time === null) return <span className="text-muted-foreground">Time TBD</span>
  return (
    <span className="text-muted-foreground">
      {formatRelative(match.time, now)} · {formatClock(match.time)}
      {match.timeIsPredicted && ' (est.)'}
    </span>
  )
}

function TeamCard({ team, alliance }: { team: AllianceTeam; alliance: 'red' | 'blue' }) {
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{team.number}</span>
        <span className="line-clamp-1 text-xs text-muted-foreground">{team.nickname ?? 'Not on roster'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {team.ballsPerMatch !== null && (
          <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{team.ballsPerMatch} balls</span>
        )}
        <span className={cn('rounded-full px-2 py-0.5', team.scoutCount === 0 && 'text-destructive')}>
          {team.scoutCount === 0 ? 'Not scouted' : `${team.scoutCount} scout${team.scoutCount === 1 ? '' : 's'}`}
        </span>
        <TierBadge tier={team.tier} />
      </div>
    </>
  )

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg border p-2 pl-3',
        alliance === 'red'
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-blue-500/30 bg-blue-500/5',
        team.watched && 'ring-2 ring-amber-500/60',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {team.teamId ? (
          <Link to={`/teams?team=${team.teamId}`} className="block hover:underline">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      {team.teamId && (
        <WatchButton teamId={team.teamId} watched={team.watched} label={`team ${team.number}`} />
      )}
    </div>
  )
}

function NextMatchCard({ match, now }: { match: UpcomingMatch; now: number }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Qual {match.matchNumber}</h2>
        <span className="text-sm">
          <MatchTime match={match} now={now} />
        </span>
      </div>
      {match.watchedCount > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {match.watchedCount} team{match.watchedCount === 1 ? '' : 's'} you&rsquo;re watching
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-red-600 uppercase dark:text-red-400">Red</p>
          {match.red.map((team) => (
            <TeamCard key={`${team.number}`} team={team} alliance="red" />
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-blue-600 uppercase dark:text-blue-400">Blue</p>
          {match.blue.map((team) => (
            <TeamCard key={`${team.number}`} team={team} alliance="blue" />
          ))}
        </div>
      </div>
    </div>
  )
}

function UpcomingRow({ match, now }: { match: UpcomingMatch; now: number }) {
  const numbers = (teams: AllianceTeam[]) =>
    teams.map((team) => (
      <span key={team.number} className={cn('tabular-nums', team.watched && 'font-semibold text-amber-500')}>
        {team.number}
      </span>
    ))

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card p-3 text-sm text-card-foreground">
      <span className="w-12 shrink-0 font-semibold tabular-nums">Q{match.matchNumber}</span>
      <span className="flex gap-2 text-red-600 dark:text-red-400">{numbers(match.red)}</span>
      <span className="text-muted-foreground">vs</span>
      <span className="flex gap-2 text-blue-600 dark:text-blue-400">{numbers(match.blue)}</span>
      <span className="ml-auto text-xs">
        <MatchTime match={match} now={now} />
      </span>
    </li>
  )
}

function WatchListSection({ matches }: { matches: UpcomingMatch[] }) {
  const watchlist = useQuery(api.watchlist.listMine)

  if (watchlist === undefined) return <p className="text-muted-foreground">Loading…</p>
  if (watchlist.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No teams marked yet. Tap the star on a team to watch it — starred teams are highlighted in
        every upcoming match.
      </p>
    )
  }

  // First upcoming appearance per watched team; `matches` is already in play order.
  const nextMatchFor = new Map<number, UpcomingMatch>()
  for (const match of matches) {
    for (const team of [...match.red, ...match.blue]) {
      if (team.watched && !nextMatchFor.has(team.number)) nextMatchFor.set(team.number, match)
    }
  }

  return (
    <ul className="space-y-2">
      {watchlist.map((team) => {
        const next = nextMatchFor.get(team.number)
        return (
          <li key={team.teamId}>
            <Link
              to={`/teams?team=${team.teamId}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-muted"
            >
              <span className="w-12 shrink-0 font-semibold tabular-nums">{team.number}</span>
              <span className="line-clamp-1 text-sm">{team.nickname}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {next ? `Q${next.matchNumber}` : 'No matches left'}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function NextMatch() {
  const data = useQuery(api.matches.upcoming, {})
  const refresh = useAction(api.tba.refreshMatches)
  const now = useNow()
  const [refreshing, setRefreshing] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const autoPulled = useRef(false)

  const pull = useCallback(
    async (manual: boolean) => {
      setRefreshing(true)
      try {
        const result = await refresh({})
        if (result.ok) {
          if (manual) toast.success(`${result.upcoming} upcoming of ${result.total} matches`)
        } else if (manual) {
          toast.error(result.error)
        }
      } catch {
        if (manual) toast.error('Could not reach The Blue Alliance')
      } finally {
        setRefreshing(false)
      }
    },
    [refresh],
  )

  // One quiet pull per visit when the stored schedule has gone stale; manual
  // refreshes stay available for the "they just called us to the field" case.
  useEffect(() => {
    if (autoPulled.current || data === undefined) return
    if (data.syncedAt !== null && Date.now() - data.syncedAt < STALE_AFTER_MS) return
    autoPulled.current = true
    void pull(false)
  }, [data, pull])

  if (data === undefined) return <p className="text-muted-foreground">Loading…</p>

  const [next, ...rest] = data.matches
  const following = showAll ? rest : rest.slice(0, FOLLOWING_COUNT)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.totalUpcoming} match{data.totalUpcoming === 1 ? '' : 'es'} left
          {data.syncedAt !== null && ` · synced ${formatRelative(data.syncedAt, now)}`}
        </p>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void pull(true)}>
          <RefreshCwIcon className={cn(refreshing && 'animate-spin')} aria-hidden />
          {refreshing ? 'Pulling…' : 'Pull from TBA'}
        </Button>
      </div>

      {next === undefined ? (
        <p className="text-muted-foreground">
          No upcoming matches. Pull from TBA, or ask an admin to import the event schedule.
        </p>
      ) : (
        <NextMatchCard match={next} now={now} />
      )}

      {rest.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">After that</h2>
          <ul className="space-y-2">
            {following.map((match) => (
              <UpcomingRow key={match._id} match={match} now={now} />
            ))}
          </ul>
          {rest.length > FOLLOWING_COUNT && (
            <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show less' : `Show all ${rest.length}`}
            </Button>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Teams to watch</h2>
        <WatchListSection matches={data.matches} />
      </section>
    </div>
  )
}

export function NextMatchPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Next Match</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to see the match schedule.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <NextMatch />
      </Authenticated>
    </div>
  )
}

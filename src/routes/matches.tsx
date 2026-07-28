import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Stepper } from '@/components/stepper'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ManualEntry() {
  const teams = useQuery(api.teams.list)
  const [matchNumber, setMatchNumber] = useState(1)
  const [teamNumber, setTeamNumber] = useState<number | null>(null)

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Manual entry</h2>
      <div className="flex flex-wrap items-end gap-4">
        <Stepper label="Match #" value={matchNumber} onChange={setMatchNumber} min={1} />
        <div className="min-w-40 flex-1 space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Team</span>
          <Select value={teamNumber} onValueChange={setTeamNumber}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {teams?.map((team) => (
                <SelectItem key={team._id} value={team.number}>
                  {team.number} — {team.nickname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {teamNumber == null ? (
          <Button type="button" disabled className="h-11">
            Go
          </Button>
        ) : (
          <Button
            nativeButton={false}
            className="h-11"
            render={<Link to={`/matches/${matchNumber}/${teamNumber}`} />}
          >
            Go
          </Button>
        )}
      </div>
    </div>
  )
}

type Match = NonNullable<ReturnType<typeof useQuery<typeof api.matches.list>>>[number]

function MatchCard({
  match,
  expanded,
  onToggle,
}: {
  match: Match
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">Q{match.matchNumber}</span>
          {match.scheduledTime !== undefined && (
            <span className="text-sm text-muted-foreground">
              {formatTime(match.scheduledTime)}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-sm font-medium">
          <span className="text-red-600 dark:text-red-400">{match.redTeams.join(' · ')}</span>
          <span className="text-blue-600 dark:text-blue-400">{match.blueTeams.join(' · ')}</span>
        </div>
      </button>
      {expanded && (
        <div className="grid grid-cols-3 gap-2 border-t p-3">
          {match.redTeams.map((team) => (
            <Button
              key={`red-${team}`}
              nativeButton={false}
              variant="outline"
              className="h-11 border-red-600/40 text-red-600 hover:bg-red-600/10 dark:text-red-400"
              render={<Link to={`/matches/${match.matchNumber}/${team}`} state={{ matchId: match._id }} />}
            >
              {team}
            </Button>
          ))}
          {match.blueTeams.map((team) => (
            <Button
              key={`blue-${team}`}
              nativeButton={false}
              variant="outline"
              className="h-11 border-blue-600/40 text-blue-600 hover:bg-blue-600/10 dark:text-blue-400"
              render={<Link to={`/matches/${match.matchNumber}/${team}`} state={{ matchId: match._id }} />}
            >
              {team}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function Dashboard() {
  const matches = useQuery(api.matches.list)
  const [expandedId, setExpandedId] = useState<Id<'matches'> | null>(null)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Match Scouting</h1>
      <ManualEntry />
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Schedule</h2>
        {matches === undefined && <p className="text-muted-foreground">Loading…</p>}
        {matches?.length === 0 && (
          <p className="text-muted-foreground">No matches scheduled for the active event.</p>
        )}
        <div className="space-y-2">
          {matches?.map((match) => (
            <MatchCard
              key={match._id}
              match={match}
              expanded={expandedId === match._id}
              onToggle={() => setExpandedId(expandedId === match._id ? null : match._id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function MatchesPage() {
  return (
    <div className="space-y-2">
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          You are not signed in.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <Dashboard />
      </Authenticated>
    </div>
  )
}

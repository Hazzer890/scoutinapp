import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { CheckIcon } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'

function TeamGrid() {
  const teams = useQuery(api.teams.listWithStatus)

  if (teams === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (teams.length === 0) {
    return <p className="text-muted-foreground">No teams for the active event.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {teams.map((team) => (
        <Link
          key={team._id}
          to={`/scout/${team._id}`}
          className="relative flex h-24 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card text-card-foreground transition-colors hover:bg-muted"
        >
          {team.pitScouted && (
            <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-green-600 text-white">
              <CheckIcon className="size-3.5" />
            </span>
          )}
          <span className="text-2xl font-semibold tabular-nums">{team.number}</span>
          <span className="line-clamp-1 px-2 text-xs text-muted-foreground">{team.nickname}</span>
        </Link>
      ))}
    </div>
  )
}

export function ScoutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scout Teams</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to scout teams.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <TeamGrid />
      </Authenticated>
    </div>
  )
}

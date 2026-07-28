import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'
import { CountUp } from '@/components/reactbits/count-up'
import { Button } from '@/components/ui/button'

const quickLinks = [
  { to: '/teams', label: 'Teams' },
  { to: '/pit', label: 'Pit Scouting' },
  { to: '/matches', label: 'Match Scouting' },
  { to: '/picklist', label: 'Pick List' },
]

function Dashboard() {
  const event = useQuery(api.events.getActive)
  const teams = useQuery(api.teams.listWithStatus)
  const me = useQuery(api.users.me)

  const totalTeams = teams?.length ?? 0
  const teamsScouted = teams?.filter((t) => t.pitScouted).length ?? 0
  const totalMatchReports = teams?.reduce((sum, t) => sum + t.matchReportCount, 0) ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{event?.name ?? 'No active event'}</h1>
        {event === null && (
          <p className="text-muted-foreground">
            {me?.role === 'admin' ? (
              <>
                Set an active event in{' '}
                <Link to="/admin" className="underline">
                  Admin
                </Link>
                .
              </>
            ) : (
              'Ask an admin to set an active event.'
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Teams scouted</p>
          <p className="text-3xl font-semibold tabular-nums">
            <CountUp to={teamsScouted} /> / {totalTeams}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Match reports</p>
          <p className="text-3xl font-semibold tabular-nums">
            <CountUp to={totalMatchReports} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {quickLinks.map((link) => (
          <Button key={link.to} nativeButton={false} render={<Link to={link.to} />}>
            {link.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function HomePage() {
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

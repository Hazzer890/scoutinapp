import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../../convex/_generated/api'
import { FilterChips } from '@/components/filter-chips'
import { Input } from '@/components/ui/input'
import { PitStatusBadge, TierBadge, TeamDetail } from '@/components/team-detail'
import type { FunctionReturnType } from 'convex/server'

type TeamWithStatus = FunctionReturnType<typeof api.teams.listWithStatus>[number]

function TeamsList() {
  const teams = useQuery(api.teams.listWithStatus)
  const me = useQuery(api.users.me)
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'scouted' | 'unscouted'>('all')

  const isAdmin = me?.role === 'admin'
  const teamsLoading = teams === undefined
  const selectedTeamId = searchParams.get('team')
  const selectedTeam = teams?.find((t) => t._id === selectedTeamId) ?? null

  // Keep showing the last team's data while the dialog/sheet closing animation plays,
  // but drop it once we know the current id is stale/invalid so we don't show team A's
  // data under team B's (bad) id.
  const [displayTeam, setDisplayTeam] = useState<TeamWithStatus | null>(null)
  useEffect(() => {
    if (selectedTeam) {
      setDisplayTeam(selectedTeam)
    } else if (selectedTeamId && !teamsLoading) {
      setDisplayTeam(null)
    }
  }, [selectedTeam, selectedTeamId, teamsLoading])

  const filtered = useMemo(() => {
    if (!teams) return []
    const q = search.trim().toLowerCase()
    const bySearch = q
      ? teams.filter((t) => t.number.toString().includes(q) || t.nickname.toLowerCase().includes(q))
      : teams
    if (filter === 'all') return bySearch
    return bySearch.filter((t) => (filter === 'scouted' ? t.scoutCount > 0 : t.scoutCount === 0))
  }, [teams, search, filter])

  function closeDetail() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('team')
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Teams</h1>
      <Input
        placeholder="Search by number or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search teams"
      />
      <FilterChips
        options={[
          { value: 'all', label: 'All' },
          { value: 'scouted', label: 'Scouted' },
          { value: 'unscouted', label: 'Unscouted' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {teams === undefined ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No teams found.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((team) => (
            <li key={team._id}>
              <Link
                to={`/teams?team=${team._id}`}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-lg font-semibold tabular-nums">{team.number}</span>
                  <span className="text-sm">{team.nickname}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PitStatusBadge count={team.scoutCount} />
                  <TierBadge tier={team.personalTier} />
                  {isAdmin && team.primaryTier && team.primaryTier !== team.personalTier && (
                    <TierBadge tier={team.primaryTier} label="Primary:" />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <TeamDetail
        team={displayTeam}
        loading={teamsLoading}
        isAdmin={isAdmin}
        open={selectedTeamId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
      />
    </div>
  )
}

export function TeamsPage() {
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
        <TeamsList />
      </Authenticated>
    </div>
  )
}

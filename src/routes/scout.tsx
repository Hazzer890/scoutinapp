import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { CheckIcon, MessageSquareIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'
import { FilterChips } from '@/components/filter-chips'
import { TeamCommentsDialog } from '@/components/team-comments'
import { Button } from '@/components/ui/button'

type TeamWithStatus = FunctionReturnType<typeof api.teams.listWithStatus>[number]

function TeamGrid() {
  const teams = useQuery(api.teams.listWithStatus)
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all')
  const [commentTeam, setCommentTeam] = useState<TeamWithStatus | null>(null)

  if (teams === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (teams.length === 0) {
    return <p className="text-muted-foreground">No teams for the active event.</p>
  }

  const filtered = teams.filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.scoutedByMe : !t.scoutedByMe,
  )

  return (
    <div className="space-y-3">
      <FilterChips
        options={[
          { value: 'all', label: 'All' },
          { value: 'todo', label: 'To scout' },
          { value: 'done', label: 'Scouted' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {filtered.length === 0 ? (
        <p className="text-muted-foreground">No teams match this filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((team) => (
            <div key={team._id} className="relative">
              <Link
                to={`/scout/${team._id}`}
                className="flex h-24 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card pb-5 text-card-foreground transition-colors hover:bg-muted"
              >
                {team.scoutedByMe && (
                  <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-green-600 text-white">
                    <CheckIcon className="size-3.5" />
                  </span>
                )}
                {team.scoutCount > 0 && (
                  <span className="absolute top-2 left-2 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                    {team.scoutCount}
                  </span>
                )}
                <span className="text-2xl font-semibold tabular-nums">{team.number}</span>
                <span className="line-clamp-1 px-2 text-xs text-muted-foreground">{team.nickname}</span>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Comment on team ${team.number}`}
                className="absolute right-1 bottom-1 h-8 px-2 text-muted-foreground"
                onClick={() => setCommentTeam(team)}
              >
                <MessageSquareIcon className="size-4" />
                {team.commentCount > 0 && (
                  <span className="text-xs tabular-nums">{team.commentCount}</span>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <TeamCommentsDialog
        teamId={commentTeam?._id ?? null}
        title={commentTeam ? `${commentTeam.number} — ${commentTeam.nickname}` : 'Comments'}
        open={commentTeam !== null}
        onOpenChange={(open) => {
          if (!open) setCommentTeam(null)
        }}
      />
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

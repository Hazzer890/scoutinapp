import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { GitMergeIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { Tier } from '../../convex/lib/constants'
import { RobotTinder } from '@/components/picklist/robot-tinder'
import { TierList } from '@/components/picklist/tier-list'
import { MergeDialog } from '@/components/merge-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type View = 'mine' | 'primary' | 'scouts' | 'tinder'

const DESCRIPTIONS: Record<View, string> = {
  mine: 'Tap a tier badge to rank a team; arrows reorder within a tier.',
  primary: 'The shared primary list used during alliance selection.',
  scouts: 'Read-only view of another scout’s list.',
  tinder: 'Swipe through unranked robots and file each one into a tier.',
}

function Picklist() {
  const me = useQuery(api.users.me)
  const isAdmin = me?.role === 'admin'

  const teams = useQuery(api.teams.listWithStatus)
  const stats = useQuery(api.stats.forEvent)
  const mine = useQuery(api.picklists.getMine)
  const primary = useQuery(api.picklists.getPrimary, isAdmin ? {} : 'skip')
  const scoutLists = useQuery(api.picklists.listAll, isAdmin ? {} : 'skip')
  const moveEntry = useMutation(api.picklists.moveEntry)

  const [view, setView] = useState<View>('mine')
  const [scoutId, setScoutId] = useState<Id<'users'> | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)

  const activeScoutId = scoutId ?? scoutLists?.[0]?.scoutId ?? null
  const scoutList = scoutLists?.find((l) => l.scoutId === activeScoutId)
  const readOnly = view === 'scouts'
  const entries =
    view === 'primary' ? primary?.entries : readOnly ? (scoutList?.entries ?? []) : mine?.entries

  async function handleMove(teamId: Id<'teams'>, tier: Tier | null, rank: number) {
    try {
      await moveEntry({ scope: view === 'primary' ? 'primary' : 'mine', teamId, tier, rank })
    } catch (error) {
      toast.error(
        error instanceof ConvexError && error.data === 'S tier is full'
          ? 'S tier is full'
          : 'Could not move that team',
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pick List</h1>
          <p className="text-sm text-muted-foreground">{DESCRIPTIONS[view]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(value) => setView(value as View)}>
            <TabsList>
              <TabsTrigger value="mine">My list</TabsTrigger>
              {isAdmin && <TabsTrigger value="primary">Primary</TabsTrigger>}
              {isAdmin && <TabsTrigger value="scouts">Scouts</TabsTrigger>}
              <TabsTrigger value="tinder">Robot Tinder</TabsTrigger>
            </TabsList>
          </Tabs>

          {readOnly && (
            <Select
              value={activeScoutId}
              onValueChange={(value) => setScoutId(value as Id<'users'>)}
            >
              <SelectTrigger className="min-w-40" aria-label="Scout">
                <SelectValue>
                  {(value: string | null) =>
                    value === null
                      ? 'No scout lists'
                      : (scoutLists?.find((l) => l.scoutId === value)?.scoutName ?? 'Unnamed scout')
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(scoutLists ?? []).map((list) => (
                  <SelectItem key={list.scoutId} value={list.scoutId}>
                    {list.scoutName ?? 'Unnamed scout'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isAdmin && (
            <Button variant="outline" onClick={() => setMergeOpen(true)}>
              <GitMergeIcon />
              Merge
            </Button>
          )}
        </div>
      </div>

      {teams === undefined || entries === undefined || (readOnly && scoutLists === undefined) ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="text-muted-foreground">
          No teams yet — an admin needs to set an active event and import teams.
        </p>
      ) : readOnly && !scoutList ? (
        <p className="text-muted-foreground">No scout has started a pick list yet.</p>
      ) : view === 'tinder' ? (
        // Tinder always files into YOUR list, regardless of admin tabs.
        <RobotTinder
          entries={mine?.entries ?? []}
          teams={teams}
          stats={stats ?? {}}
          onAssign={(teamId, tier) => void handleMove(teamId, tier, 9999)}
        />
      ) : (
        <TierList
          key={readOnly ? `scout-${activeScoutId}` : view}
          entries={entries}
          teams={teams}
          stats={stats ?? {}}
          readOnly={readOnly}
          onMove={(teamId, tier, rank) => void handleMove(teamId, tier, rank)}
        />
      )}

      {isAdmin && (
        <MergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          teams={teams ?? []}
          listCount={scoutLists?.length ?? 0}
        />
      )}
    </div>
  )
}

export function PicklistPage() {
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
        <Picklist />
      </Authenticated>
    </div>
  )
}

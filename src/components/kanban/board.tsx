import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'
import { S_TIER_MAX, TIERS, type Tier } from '../../../convex/lib/constants'
import { TeamCard, type TeamStats, type TeamWithStatus } from '@/components/kanban/team-card'
import { cn } from '@/lib/utils'

const UNCATEGORIZED = 'uncategorized'
type ColumnId = Tier | typeof UNCATEGORIZED

const COLUMN_LABELS: Record<ColumnId, string> = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  DNP: 'Do Not Pick',
  uncategorized: 'Uncategorized',
}
const COLUMN_IDS: ColumnId[] = [...TIERS, UNCATEGORIZED]

const COLUMN_ACCENTS: Record<ColumnId, string> = {
  S: 'bg-purple-500',
  A: 'bg-blue-500',
  B: 'bg-green-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  DNP: 'bg-red-500',
  uncategorized: 'bg-muted-foreground/40',
}

export type PicklistEntry = { teamId: Id<'teams'>; tier: Tier; rank: number }

function SortableTeamCard({
  team,
  stats,
  readOnly,
}: {
  team: TeamWithStatus
  stats: TeamStats | undefined
  readOnly: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: team._id,
    disabled: readOnly,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(!readOnly && 'cursor-grab active:cursor-grabbing')}
      {...(readOnly ? {} : attributes)}
      {...listeners}
    >
      <TeamCard team={team} stats={stats} dragging={isDragging} />
    </div>
  )
}

function Column({
  id,
  teams,
  stats,
  isOver,
  readOnly,
}: {
  id: ColumnId
  teams: TeamWithStatus[]
  stats: Record<string, TeamStats>
  isOver: boolean
  readOnly: boolean
}) {
  const { setNodeRef } = useDroppable({ id, disabled: readOnly })
  const full = id === 'S' && teams.length >= S_TIER_MAX

  return (
    <section
      ref={setNodeRef}
      aria-label={COLUMN_LABELS[id]}
      className={cn(
        'flex h-full w-64 shrink-0 snap-start flex-col rounded-xl border bg-muted/40 transition-colors sm:w-72',
        isOver && !readOnly && 'border-primary bg-primary/5 ring-2 ring-primary/40',
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn('size-2 shrink-0 rounded-full', COLUMN_ACCENTS[id])} aria-hidden />
        <h2 className="truncate text-sm font-semibold">{COLUMN_LABELS[id]}</h2>
        <span className="rounded-full bg-background px-1.5 text-xs tabular-nums text-muted-foreground">
          {teams.length}
        </span>
        {id === 'S' && (
          <span
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium',
              full ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300' : 'bg-muted text-muted-foreground',
            )}
          >
            {S_TIER_MAX} max
          </span>
        )}
      </header>

      <SortableContext items={teams.map((t) => t._id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
          {teams.map((team) => (
            <SortableTeamCard key={team._id} team={team} stats={stats[team._id]} readOnly={readOnly} />
          ))}
          {teams.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              {readOnly ? 'Empty' : 'Drop teams here'}
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

export function Board({
  entries,
  teams,
  stats,
  readOnly = false,
  onMove,
}: {
  entries: PicklistEntry[]
  teams: TeamWithStatus[]
  stats: Record<string, TeamStats>
  readOnly?: boolean
  onMove: (teamId: Id<'teams'>, tier: Tier | null, rank: number) => void
}) {
  const [activeId, setActiveId] = useState<Id<'teams'> | null>(null)
  const [overColumn, setOverColumn] = useState<ColumnId | null>(null)

  // Touch drags need a long-press so a quick swipe still scrolls the columns on phones.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Convex is the source of truth; columns are derived from the live query on every render.
  const columns = useMemo(() => {
    const byId = new Map(teams.map((t) => [t._id as string, t]))
    const grouped = new Map<ColumnId, PicklistEntry[]>(COLUMN_IDS.map((id) => [id, []]))
    const placed = new Set<string>()
    for (const entry of entries) {
      if (!byId.has(entry.teamId)) continue
      grouped.get(entry.tier)!.push(entry)
      placed.add(entry.teamId)
    }
    const result = new Map<ColumnId, TeamWithStatus[]>()
    for (const id of TIERS) {
      result.set(
        id,
        grouped
          .get(id)!
          .sort((a, b) => a.rank - b.rank)
          .map((e) => byId.get(e.teamId)!),
      )
    }
    result.set(
      UNCATEGORIZED,
      teams.filter((t) => !placed.has(t._id)).sort((a, b) => a.number - b.number),
    )
    return result
  }, [entries, teams])

  const activeTeam = activeId ? teams.find((t) => t._id === activeId) : undefined

  function columnOf(id: string): ColumnId | null {
    if (COLUMN_IDS.includes(id as ColumnId)) return id as ColumnId
    for (const [columnId, columnTeams] of columns) {
      if (columnTeams.some((t) => t._id === id)) return columnId
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as Id<'teams'>)
    setOverColumn(columnOf(String(event.active.id)))
  }

  function handleDragOver(event: DragOverEvent) {
    setOverColumn(event.over ? columnOf(String(event.over.id)) : null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverColumn(null)
    if (!over) return

    const teamId = active.id as Id<'teams'>
    const from = columnOf(String(active.id))
    const to = columnOf(String(over.id))
    if (!from || !to) return

    const target = columns.get(to)!
    const overIndex = target.findIndex((t) => t._id === over.id)

    if (from === to) {
      // Uncategorized is sorted by team number, so reordering inside it means nothing.
      if (to === UNCATEGORIZED) return
      // Dropped on the column background rather than a card: send it to the end.
      const rank = overIndex === -1 ? target.length - 1 : overIndex
      if (rank === target.findIndex((t) => t._id === teamId)) return
      onMove(teamId, to, rank)
      return
    }

    if (to === 'S' && target.length >= S_TIER_MAX) {
      toast.error(`S tier holds ${S_TIER_MAX} teams max`)
      return
    }

    let rank = target.length
    if (overIndex !== -1) {
      const dragged = active.rect.current.translated
      const below = dragged && over.rect ? dragged.top > over.rect.top + over.rect.height / 2 : false
      rank = overIndex + (below ? 1 : 0)
    }
    onMove(teamId, to === UNCATEGORIZED ? null : to, rank)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOverColumn(null)
      }}
    >
      <div className="flex h-[calc(100svh-14rem)] min-h-96 snap-x gap-3 overflow-x-auto pb-2">
        {COLUMN_IDS.map((id) => (
          <Column
            key={id}
            id={id}
            teams={columns.get(id)!}
            stats={stats}
            isOver={overColumn === id}
            readOnly={readOnly}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTeam && (
          <TeamCard team={activeTeam} stats={stats[activeTeam._id]} overlay className="w-60 sm:w-68" />
        )}
      </DragOverlay>
    </DndContext>
  )
}

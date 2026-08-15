import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'
import { cn } from '@/lib/utils'

type TeamPhotos = FunctionReturnType<typeof api.pitReports.photosForEvent>[number]

function TeamGroup({ group }: { group: TeamPhotos }) {
  const [open, setOpen] = useState(false)
  const panelId = `gallery-photos-${group.teamId}`
  const count = group.photos.length

  return (
    <li className="overflow-hidden rounded-lg border bg-card text-card-foreground">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted"
      >
        <img
          src={group.photos[0].photoUrl}
          alt={`${group.nickname} robot`}
          loading="lazy"
          className="size-12 shrink-0 rounded-md border object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums">{group.teamNumber}</span>
            <span className="line-clamp-1 text-sm">{group.nickname}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {count} photo{count === 1 ? '' : 's'}
          </span>
        </span>
        <ChevronDownIcon
          className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {group.photos.map((photo, i) => (
              <div
                key={`${group.teamId}-${i}`}
                className="relative aspect-square overflow-hidden rounded-lg border bg-background"
              >
                <img
                  src={photo.photoUrl}
                  alt={`${group.nickname} robot, scouted by ${photo.scoutName}`}
                  loading="lazy"
                  className="size-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-medium text-white">
                  {photo.scoutName}
                </span>
              </div>
            ))}
          </div>
          <Link to={`/teams?team=${group.teamId}`} className="text-sm underline">
            View team details
          </Link>
        </div>
      )}
    </li>
  )
}

function Gallery() {
  const groups = useQuery(api.pitReports.photosForEvent)

  if (groups === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (groups.length === 0) {
    return <p className="text-muted-foreground">No robot photos yet.</p>
  }

  return (
    <ul className="space-y-2">
      {groups.map((group) => (
        <TeamGroup key={group.teamId} group={group} />
      ))}
    </ul>
  )
}

export function GalleryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Robot Gallery</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to see robot photos.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <Gallery />
      </Authenticated>
    </div>
  )
}

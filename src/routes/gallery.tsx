import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { Link } from 'react-router'
import { api } from '../../convex/_generated/api'

function Gallery() {
  const photos = useQuery(api.pitReports.photosForEvent)

  if (photos === undefined) {
    return <p className="text-muted-foreground">Loading…</p>
  }
  if (photos.length === 0) {
    return <p className="text-muted-foreground">No robot photos yet.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo, i) => (
        <Link
          key={`${photo.teamId}-${i}`}
          to={`/teams?team=${photo.teamId}`}
          className="group relative aspect-square overflow-hidden rounded-lg border bg-card"
        >
          <img
            src={photo.photoUrl}
            alt={`${photo.nickname} robot`}
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-medium text-white">
            <span className="text-sm font-semibold tabular-nums">{photo.teamNumber}</span>{' '}
            <span className="line-clamp-1 opacity-90">{photo.nickname}</span>
          </span>
        </Link>
      ))}
    </div>
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

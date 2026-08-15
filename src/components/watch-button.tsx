import { useMutation } from 'convex/react'
import { StarIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { cn } from '@/lib/utils'

// Star toggle for "watch this robot". Rendered as a bare <button> rather than
// the ui Button so it can sit next to a row link without nesting interactives.
export function WatchButton({
  teamId,
  watched,
  label,
  // 'icon' is the square star for list rows; 'pill' adds visible text and is
  // what detail panels use, since their top-right corner belongs to the close X.
  variant = 'icon',
  className,
}: {
  teamId: Id<'teams'>
  watched: boolean
  // Team number/nickname, so the accessible name distinguishes rows.
  label: string
  variant?: 'icon' | 'pill'
  className?: string
}) {
  const toggle = useMutation(api.watchlist.toggle)
  const [pending, setPending] = useState(false)

  async function handleClick() {
    setPending(true)
    try {
      const now = await toggle({ teamId })
      toast.success(now ? `Watching ${label}` : `Stopped watching ${label}`)
    } catch {
      toast.error('Could not update watch list')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? `Stop watching ${label}` : `Watch ${label}`}
      disabled={pending}
      onClick={(e) => {
        // Rows put this button inside a clickable card; don't follow the link.
        e.preventDefault()
        e.stopPropagation()
        void handleClick()
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'icon' ? 'size-10' : 'h-9 border px-3',
        watched
          ? 'text-amber-500 hover:bg-amber-500/10'
          : 'text-muted-foreground hover:bg-muted',
        variant === 'pill' && (watched ? 'border-amber-500/40' : 'border-input'),
        className,
      )}
    >
      <StarIcon className="size-5" fill={watched ? 'currentColor' : 'none'} aria-hidden />
      {variant === 'pill' && (watched ? 'Watching' : 'Watch')}
    </button>
  )
}

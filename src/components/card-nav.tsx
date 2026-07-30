import { useAuthActions } from '@convex-dev/auth/react'
import { Authenticated, Unauthenticated, useQuery } from 'convex/react'
import { ArrowUpRightIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { api } from '../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

// Adapted from reactbits.dev's CardNav: GSAP timeline replaced with CSS
// height/opacity transitions, hex color props replaced with theme tokens,
// <a href> replaced with router NavLinks.

const CARD_STYLES = [
  'bg-primary text-primary-foreground',
  'bg-muted text-foreground',
  'bg-accent text-accent-foreground',
]

const COLLAPSED_HEIGHT = 60

export function CardNav() {
  const me = useQuery(api.users.me)
  const { signOut } = useAuthActions()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // ponytail: measured height goes stale if the viewport resizes while open;
  // closing is cheaper than remeasuring and the case is rare.
  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [])

  const cards = [
    { label: 'Browse', links: [{ to: '/', label: 'Home' }, { to: '/teams', label: 'Teams' }] },
    {
      label: 'Scout',
      links: [
        { to: '/scout', label: 'Scout Teams' },
        { to: '/picklist', label: 'Pick List' },
        { to: '/leaderboard', label: 'Leaderboard' },
      ],
    },
    ...(me?.role === 'admin' ? [{ label: 'Manage', links: [{ to: '/admin', label: 'Admin' }] }] : []),
  ]

  const height = open
    ? COLLAPSED_HEIGHT + (contentRef.current?.scrollHeight ?? 200) + 8
    : COLLAPSED_HEIGHT

  return (
    <div className="fixed inset-x-0 top-4 z-50 mx-auto w-[90%] max-w-[800px]">
      <nav
        className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-md transition-[height] duration-300 ease-out motion-reduce:transition-none"
        style={{ height }}
      >
        <div className="flex h-[60px] items-center justify-between gap-2 p-2 pl-4">
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="group flex h-full cursor-pointer flex-col items-center justify-center gap-1.5"
          >
            <span
              className={cn(
                'h-0.5 w-[26px] bg-current transition-transform duration-300 motion-reduce:transition-none',
                open && 'translate-y-1 rotate-45',
              )}
            />
            <span
              className={cn(
                'h-0.5 w-[26px] bg-current transition-transform duration-300 motion-reduce:transition-none',
                open && '-translate-y-1 -rotate-45',
              )}
            />
          </button>

          <Link to="/" className="font-semibold sm:absolute sm:left-1/2 sm:-translate-x-1/2" onClick={() => setOpen(false)}>
            scoutinapp
          </Link>

          <div className="flex items-center gap-2">
            <Unauthenticated>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/sign-in" />}>
                Sign in
              </Button>
            </Unauthenticated>
            <Authenticated>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void signOut().then(() => navigate('/'))}
              >
                Sign out
              </Button>
            </Authenticated>
            <ModeToggle />
          </div>
        </div>

        <div
          ref={contentRef}
          aria-hidden={!open}
          className={cn(
            'flex flex-col items-stretch gap-2 p-2 pt-0 sm:flex-row sm:items-end',
            !open && 'invisible',
          )}
          style={{ transition: open ? undefined : 'visibility 0s 0.3s' }}
        >
          {cards.map((card, i) => (
            <div
              key={card.label}
              className={cn(
                'flex min-h-[110px] flex-1 flex-col gap-2 rounded-lg p-3 px-4 transition-[opacity,transform] duration-300 motion-reduce:transition-none',
                CARD_STYLES[i % CARD_STYLES.length],
                open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
              )}
              style={{ transitionDelay: open ? `${100 + i * 80}ms` : '0ms' }}
            >
              <span className="text-lg tracking-tight sm:text-xl">{card.label}</span>
              <div className="mt-auto flex flex-col gap-0.5">
                {card.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    tabIndex={open ? 0 : -1}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-75 sm:text-base',
                        isActive && 'underline underline-offset-4',
                      )
                    }
                  >
                    <ArrowUpRightIcon className="size-4 shrink-0" aria-hidden="true" />
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  )
}

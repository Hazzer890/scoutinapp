import { useQuery } from 'convex/react'
import { MenuIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { api } from '../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/teams', label: 'Teams' },
  { to: '/pit', label: 'Pit Scouting' },
  { to: '/matches', label: 'Match Scouting' },
  { to: '/picklist', label: 'Pick List' },
]

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
  )
}

export function AppNav() {
  const me = useQuery(api.users.me)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const items = me?.role === 'admin' ? [...navItems, { to: '/admin', label: 'Admin' }] : navItems

  return (
    <>
      <nav className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />
          }
        >
          <MenuIcon />
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            {items.map((item) => (
              <SheetClose
                key={item.to}
                nativeButton={false}
                render={<NavLink to={item.to} end={item.to === '/'} className={linkClass} />}
              >
                {item.label}
              </SheetClose>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

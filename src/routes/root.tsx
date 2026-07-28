import { useAuthActions } from '@convex-dev/auth/react'
import { Authenticated, Unauthenticated } from 'convex/react'
import { Link, Outlet, useNavigate } from 'react-router'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'

export function RootLayout() {
  const { signOut } = useAuthActions()
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold">
            scoutinapp
          </Link>
          <AppNav />
        </div>
        <div className="flex items-center gap-2">
          <Unauthenticated>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/sign-in" />}
            >
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
      </header>
      <main className="p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}

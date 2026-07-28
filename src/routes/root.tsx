import { useAuthActions } from '@convex-dev/auth/react'
import { Authenticated, Unauthenticated } from 'convex/react'
import { Link, Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/mode-toggle'

export function RootLayout() {
  const { signOut } = useAuthActions()
  const navigate = useNavigate()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link to="/" className="font-semibold">
          scoutinapp
        </Link>
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
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}

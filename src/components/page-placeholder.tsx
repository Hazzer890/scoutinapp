import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react'
import { Link } from 'react-router'

// Shared by routes owned by later tasks so the shell compiles and gates on
// sign-in consistently before those tasks replace the file.
export function PagePlaceholder({ name }: { name: string }) {
  return (
    <>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">
          Sign in to view {name}.{' '}
          <Link to="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>
        <h1 className="text-2xl font-semibold">{name}</h1>
        <p className="text-muted-foreground">Coming soon.</p>
      </Authenticated>
    </>
  )
}

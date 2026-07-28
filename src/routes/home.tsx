import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

function Me() {
  const me = useQuery(api.users.me)
  return (
    <p className="text-muted-foreground">
      Signed in as {me?.email ?? '…'}
    </p>
  )
}

export function HomePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Home</h1>
      <AuthLoading>
        <p className="text-muted-foreground">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-muted-foreground">You are not signed in.</p>
      </Unauthenticated>
      <Authenticated>
        <Me />
      </Authenticated>
    </div>
  )
}

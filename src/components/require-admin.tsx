import type { ReactNode } from 'react'
import { useConvexAuth, useQuery } from 'convex/react'
import { Navigate } from 'react-router'
import { api } from '../../convex/_generated/api'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading } = useConvexAuth()
  const me = useQuery(api.users.me)

  if (isLoading || me === undefined) return null
  if (me?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

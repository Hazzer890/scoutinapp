import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { Navigate } from 'react-router'
import { api } from '../../convex/_generated/api'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me)

  if (me === undefined) return null
  if (me?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

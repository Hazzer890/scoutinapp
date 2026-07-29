import type { Id } from '../../../convex/_generated/dataModel'
import type { Tier } from '../../../convex/lib/constants'

export type PicklistEntry = { teamId: Id<'teams'>; tier: Tier; rank: number }

export const TIER_SOLIDS: Record<Tier, string> = {
  S: 'bg-purple-500',
  A: 'bg-blue-500',
  B: 'bg-green-600',
  C: 'bg-yellow-500 text-black!',
  D: 'bg-orange-500',
  DNP: 'bg-red-500',
}

export const TIER_DOTS: Record<Tier, string> = {
  S: 'bg-purple-500',
  A: 'bg-blue-500',
  B: 'bg-green-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  DNP: 'bg-red-500',
}

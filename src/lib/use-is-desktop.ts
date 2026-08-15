import { useSyncExternalStore } from 'react'

// ponytail: matches the sm breakpoint used elsewhere; bump if the Tailwind config's screen changes.
export function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia('(min-width: 640px)')
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(min-width: 640px)').matches,
  )
}

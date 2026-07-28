import { useEffect, useRef, useState } from 'react'

// Adapted from reactbits.dev's CountUp: rAF count-up to `to` on mount,
// skipped in favor of the final value when the user prefers reduced motion.
interface CountUpProps {
  to: number
  from?: number
  duration?: number
  className?: string
}

export function CountUp({ to, from = 0, duration = 0.8, className }: CountUpProps) {
  const [value, setValue] = useState(from)
  const frame = useRef<number>(0)
  const lastValue = useRef(from)

  useEffect(() => {
    const previous = lastValue.current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(to)
      lastValue.current = to
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / (duration * 1000), 1)
      setValue(Math.round(previous + (to - previous) * progress))
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick)
      } else {
        lastValue.current = to
      }
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [to, duration])

  return <span className={className}>{value}</span>
}

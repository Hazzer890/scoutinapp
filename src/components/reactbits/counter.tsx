import { cn } from '@/lib/utils'

// Adapted from reactbits.dev's Counter: the motion/react spring digit roll is
// replaced with a CSS transform transition on a 0-9 digit strip per place.

function Digit({ place, value, height }: { place: number; value: number; height: number }) {
  const digit = Math.floor(value / place) % 10
  return (
    <span className="relative inline-block w-[1ch] overflow-hidden" style={{ height }}>
      <span
        className="absolute inset-x-0 top-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateY(${-digit * height}px)` }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="flex items-center justify-center" style={{ height }}>
            {i}
          </span>
        ))}
      </span>
    </span>
  )
}

export function Counter({
  value,
  height = 36,
  className,
}: {
  value: number
  height?: number
  className?: string
}) {
  const places = Math.max(1, String(Math.abs(Math.trunc(value))).length)
  return (
    <span className={cn('inline-flex tabular-nums', className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        {Array.from({ length: places }, (_, i) => 10 ** (places - 1 - i)).map((place) => (
          <Digit key={place} place={place} value={value} height={height} />
        ))}
      </span>
    </span>
  )
}

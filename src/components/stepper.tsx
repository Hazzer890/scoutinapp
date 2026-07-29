import { MinusIcon, PlusIcon } from 'lucide-react'
import { Counter } from '@/components/reactbits/counter'
import { Button } from '@/components/ui/button'

interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
}

export function Stepper({ value, onChange, min = 0, max, label }: StepperProps) {
  const clamped = (next: number) => Math.min(max ?? Infinity, Math.max(min, next))

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-14 w-12 rounded-full text-base font-semibold"
          onClick={() => onChange(clamped(value - 5))}
          disabled={value <= min}
          aria-label={`Subtract 5 from ${label}`}
        >
          -5
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 w-14 rounded-full"
          onClick={() => onChange(clamped(value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <MinusIcon className="size-6" />
        </Button>
        <span className="flex min-w-14 justify-center text-3xl font-semibold">
          <Counter value={value} />
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-14 w-14 rounded-full"
          onClick={() => onChange(clamped(value + 1))}
          disabled={max !== undefined && value >= max}
          aria-label={`Increase ${label}`}
        >
          <PlusIcon className="size-6" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 w-12 rounded-full text-base font-semibold"
          onClick={() => onChange(clamped(value + 5))}
          disabled={max !== undefined && value >= max}
          aria-label={`Add 5 to ${label}`}
        >
          +5
        </Button>
      </div>
    </div>
  )
}

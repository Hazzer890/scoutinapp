import { cn } from '@/lib/utils'

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label="Filter" className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
            value === option.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background hover:bg-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

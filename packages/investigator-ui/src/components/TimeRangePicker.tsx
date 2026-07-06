import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PRESETS = [
  { value: 'now-15m', label: 'Past 15 min' },
  { value: 'now-1h', label: 'Past 1 hour' },
  { value: 'now-4h', label: 'Past 4 hours' },
  { value: 'now-1d', label: 'Past 1 day' },
  { value: 'now-2d', label: 'Past 2 days' },
  { value: 'now-7d', label: 'Past 7 days' },
]

const CUSTOM = 'custom'

interface TimeRangePickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

export function TimeRangePicker({ from, to, onChange }: TimeRangePickerProps) {
  const matchedPreset = to === 'now' && PRESETS.some((p) => p.value === from) ? from : CUSTOM
  const [mode, setMode] = useState<string>(matchedPreset)

  const handlePreset = (value: string) => {
    setMode(value)
    if (value !== CUSTOM) {
      onChange(value, 'now')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={mode} onValueChange={handlePreset}>
        <SelectTrigger size="sm" className="w-36" aria-label="Time range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {mode === CUSTOM && (
        <>
          <Input
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            placeholder="now-4h or ISO"
            className="w-36 font-mono text-xs"
            aria-label="From"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            placeholder="now or ISO"
            className="w-32 font-mono text-xs"
            aria-label="To"
          />
        </>
      )}
    </div>
  )
}

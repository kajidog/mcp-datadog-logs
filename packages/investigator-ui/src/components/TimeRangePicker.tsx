import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PRESETS = [
  { value: 'now-15m', label: 'Past 15 min' },
  { value: 'now-1h', label: 'Past 1 hour' },
  { value: 'now-4h', label: 'Past 4 hours' },
  { value: 'now-1d', label: 'Past 1 day' },
  { value: 'now-2d', label: 'Past 2 days' },
  { value: 'now-7d', label: 'Past 7 days' },
] as const

const ABSOLUTE = 'absolute'
const RAW = 'raw'

interface TimeRangePickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

export function TimeRangePicker({ from, to, onChange }: TimeRangePickerProps) {
  const [mode, setMode] = useState<string>(() => deriveMode(from, to))
  const [fromLocal, setFromLocal] = useState(() => toDateTimeLocal(resolveTimeInput(from) ?? oneHourAgo()))
  const [toLocal, setToLocal] = useState(() => toDateTimeLocal(resolveTimeInput(to) ?? new Date()))

  useEffect(() => {
    const nextMode = deriveMode(from, to)
    setMode(nextMode)
    if (nextMode === ABSOLUTE) {
      setFromLocal(toDateTimeLocal(new Date(from)))
      setToLocal(toDateTimeLocal(new Date(to)))
    }
  }, [from, to])

  const handleModeChange = (value: string) => {
    setMode(value)
    if (isPreset(value)) {
      onChange(value, 'now')
      return
    }

    if (value === ABSOLUTE) {
      const nextFrom = toDateTimeLocal(resolveTimeInput(from) ?? oneHourAgo())
      const nextTo = toDateTimeLocal(resolveTimeInput(to) ?? new Date())
      setFromLocal(nextFrom)
      setToLocal(nextTo)

      const nextFromIso = localDateTimeToIso(nextFrom)
      const nextToIso = localDateTimeToIso(nextTo)
      if (nextFromIso && nextToIso) {
        onChange(nextFromIso, nextToIso)
      }
    }
  }

  const handleAbsoluteFromChange = (value: string) => {
    setFromLocal(value)
    const nextFromIso = localDateTimeToIso(value)
    const nextToIso = localDateTimeToIso(toLocal)
    if (nextFromIso && nextToIso) {
      onChange(nextFromIso, nextToIso)
    }
  }

  const handleAbsoluteToChange = (value: string) => {
    setToLocal(value)
    const nextFromIso = localDateTimeToIso(fromLocal)
    const nextToIso = localDateTimeToIso(value)
    if (nextFromIso && nextToIso) {
      onChange(nextFromIso, nextToIso)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={mode} onValueChange={handleModeChange}>
        <SelectTrigger size="sm" className="w-40" aria-label="Time range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value={ABSOLUTE}>Date & time</SelectItem>
          <SelectItem value={RAW}>Raw value…</SelectItem>
        </SelectContent>
      </Select>
      {mode === ABSOLUTE && (
        <>
          <Input
            type="datetime-local"
            value={fromLocal}
            onChange={(e) => handleAbsoluteFromChange(e.target.value)}
            step={60}
            className="w-44 font-mono text-xs"
            aria-label="From date and time"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => handleAbsoluteToChange(e.target.value)}
            step={60}
            className="w-44 font-mono text-xs"
            aria-label="To date and time"
          />
        </>
      )}
      {mode === RAW && (
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

function deriveMode(from: string, to: string): string {
  if (to === 'now' && isPreset(from)) {
    return from
  }
  if (isAbsoluteTime(from) && isAbsoluteTime(to)) {
    return ABSOLUTE
  }
  return RAW
}

function isPreset(value: string): boolean {
  return PRESETS.some((preset) => preset.value === value)
}

function isAbsoluteTime(value: string): boolean {
  if (value.trim().toLowerCase().startsWith('now')) {
    return false
  }
  return !Number.isNaN(new Date(value).getTime())
}

function resolveTimeInput(value: string): Date | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'now') {
    return new Date()
  }

  const relative = /^now-(\d+)([mhdw])$/.exec(normalized)
  if (relative) {
    const amount = Number(relative[1])
    const unit = relative[2]
    const multiplier = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 604_800_000
    return new Date(Date.now() - amount * multiplier)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function oneHourAgo(): Date {
  return new Date(Date.now() - 3_600_000)
}

function toDateTimeLocal(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function localDateTimeToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

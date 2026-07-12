import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PRESETS = [
  { value: 'now-15m', label: '過去15分' },
  { value: 'now-1h', label: '過去1時間' },
  { value: 'now-4h', label: '過去4時間' },
  { value: 'now-1d', label: '過去1日' },
  { value: 'now-2d', label: '過去2日' },
  { value: 'now-7d', label: '過去7日' },
] as const

const ABSOLUTE = 'absolute'
const RAW = 'raw'
const DISPLAY_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'

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
        <SelectTrigger size="sm" className="w-40" aria-label="時間範囲">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value={ABSOLUTE}>日時を指定</SelectItem>
          <SelectItem value={RAW}>直接入力…</SelectItem>
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
            aria-label="開始日時"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => handleAbsoluteToChange(e.target.value)}
            step={60}
            className="w-44 font-mono text-xs"
            aria-label="終了日時"
          />
        </>
      )}
      {mode === RAW && (
        <>
          <Input
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            placeholder="now-4h または ISO (Z/+09:00)"
            className="w-36 font-mono text-xs"
            aria-label="開始"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            placeholder="now または ISO"
            className="w-32 font-mono text-xs"
            aria-label="終了"
          />
        </>
      )}
      <span className="text-[11px] text-muted-foreground">表示: {DISPLAY_TIME_ZONE}</span>
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
  return hasExplicitTimeZone(value) && !Number.isNaN(new Date(value).getTime())
}

function hasExplicitTimeZone(value: string): boolean {
  return /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())
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

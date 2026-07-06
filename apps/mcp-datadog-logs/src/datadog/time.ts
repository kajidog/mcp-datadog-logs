const TIME_MATH_PATTERN = /^now(?:\s*-\s*(\d+)\s*(s|m|h|d|w))?$/i

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
}

/**
 * Parses a Datadog-style time input into epoch milliseconds.
 * Accepts "now", "now-15m" (s/m/h/d/w), ISO 8601, and epoch seconds/millis.
 * Datadog's API accepts the original strings directly; this local parse is
 * used only for interval selection and report labels.
 */
export function parseTimeInput(input: string, nowMs: number = Date.now()): number {
  const trimmed = input.trim()
  const math = trimmed.match(TIME_MATH_PATTERN)
  if (math) {
    if (!math[1]) {
      return nowMs
    }
    const amount = Number.parseInt(math[1], 10)
    const unit = math[2].toLowerCase()
    return nowMs - amount * UNIT_MS[unit]
  }
  if (/^\d{13}$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10)
  }
  if (/^\d{10}$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1_000
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) {
    return parsed
  }
  throw new Error(`Unrecognized time value: "${input}". Use Datadog time math ("now-4h") or ISO 8601.`)
}

export interface ResolvedRange {
  fromMs: number
  toMs: number
}

export function resolveRange(from: string, to: string, nowMs: number = Date.now()): ResolvedRange {
  const fromMs = parseTimeInput(from, nowMs)
  const toMs = parseTimeInput(to, nowMs)
  if (fromMs >= toMs) {
    throw new Error(`Invalid time range: from (${from}) must be before to (${to}).`)
  }
  return { fromMs, toMs }
}

const INTERVAL_STEPS: Array<{ label: string; ms: number }> = [
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: '30m', ms: 1_800_000 },
  { label: '1h', ms: 3_600_000 },
  { label: '4h', ms: 14_400_000 },
  { label: '1d', ms: 86_400_000 },
]

/**
 * Picks a timeline bucket interval targeting ~60 buckets across the range,
 * snapped to a human-friendly step.
 */
export function pickInterval(rangeMs: number): { label: string; ms: number } {
  const target = rangeMs / 60
  for (const step of INTERVAL_STEPS) {
    if (step.ms >= target) {
      return step
    }
  }
  return INTERVAL_STEPS[INTERVAL_STEPS.length - 1]
}

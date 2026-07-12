import { describe, expect, it } from 'vitest'
import { parseTimeInput, pickInterval, resolveRange } from '../time.js'

const NOW = Date.parse('2026-07-06T12:00:00Z')

describe('parseTimeInput', () => {
  it('parses "now"', () => {
    expect(parseTimeInput('now', NOW)).toBe(NOW)
  })

  it('parses time math', () => {
    expect(parseTimeInput('now-15m', NOW)).toBe(NOW - 15 * 60_000)
    expect(parseTimeInput('now-4h', NOW)).toBe(NOW - 4 * 3_600_000)
    expect(parseTimeInput('now-2d', NOW)).toBe(NOW - 2 * 86_400_000)
    expect(parseTimeInput('now-1w', NOW)).toBe(NOW - 7 * 86_400_000)
  })

  it('parses ISO 8601', () => {
    expect(parseTimeInput('2026-07-06T10:00:00Z', NOW)).toBe(Date.parse('2026-07-06T10:00:00Z'))
    expect(parseTimeInput('2026-07-06T19:00:00+09:00', NOW)).toBe(Date.parse('2026-07-06T10:00:00Z'))
  })

  it('rejects absolute timestamps without an explicit time zone', () => {
    expect(() => parseTimeInput('2026-07-06T10:00:00', NOW)).toThrow(/must include a time zone/)
    expect(() => parseTimeInput('2026-07-06', NOW)).toThrow(/must include a time zone/)
  })

  it('parses epoch seconds and millis', () => {
    expect(parseTimeInput('1751800000', NOW)).toBe(1_751_800_000_000)
    expect(parseTimeInput('1751800000000', NOW)).toBe(1_751_800_000_000)
  })

  it('rejects garbage', () => {
    expect(() => parseTimeInput('yesterday-ish', NOW)).toThrow(/Unrecognized time value/)
  })
})

describe('resolveRange', () => {
  it('resolves from/to', () => {
    const range = resolveRange('now-1h', 'now', NOW)
    expect(range).toEqual({ fromMs: NOW - 3_600_000, toMs: NOW })
  })

  it('rejects inverted ranges', () => {
    expect(() => resolveRange('now', 'now-1h', NOW)).toThrow(/Invalid time range/)
  })
})

describe('pickInterval', () => {
  it('targets ~60 buckets', () => {
    expect(pickInterval(15 * 60_000).label).toBe('30s')
    expect(pickInterval(3_600_000).label).toBe('1m')
    expect(pickInterval(4 * 3_600_000).label).toBe('5m')
    expect(pickInterval(24 * 3_600_000).label).toBe('30m')
    expect(pickInterval(7 * 86_400_000).label).toBe('4h')
  })

  it('caps at 1d for huge ranges', () => {
    expect(pickInterval(365 * 86_400_000).label).toBe('1d')
  })
})

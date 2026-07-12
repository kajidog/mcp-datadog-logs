import type { LogRow } from '@kajidog/investigation-shared'
import { describe, expect, it } from 'vitest'
import { extractLogPatterns } from '../patterns.js'

function row(id: string, message: string): LogRow {
  return { id, timestamp: '2026-07-06T10:01:00.000Z', status: 'error', message }
}

describe('extractLogPatterns', () => {
  it('returns an empty list for no rows or empty messages', () => {
    expect(extractLogPatterns([])).toEqual([])
    expect(extractLogPatterns([row('a', ''), row('b', '   ')])).toEqual([])
  })

  it('groups messages differing only by variable tokens', () => {
    const patterns = extractLogPatterns([
      row('a', 'Payment failed for order 123 after 30s'),
      row('b', 'Payment failed for order 456 after 12s'),
      row('c', 'Cache miss'),
    ])
    expect(patterns).toHaveLength(2)
    expect(patterns[0]).toMatchObject({
      template: 'Payment failed for order <*> after <*>',
      count: 2,
      example: 'Payment failed for order 123 after 30s',
      rowIds: ['a', 'b'],
    })
    expect(patterns[0].ratio).toBeCloseTo(2 / 3)
    expect(patterns[1]).toMatchObject({ template: 'Cache miss', count: 1, rowIds: ['c'] })
  })

  it('normalizes UUIDs, timestamps, IPs, hex ids and quoted strings', () => {
    const [pattern] = extractLogPatterns([
      row(
        'a',
        'req 0d5e9c31-4a7b-4c1d-9e2f-1a2b3c4d5e6f from 10.0.12.3:8443 at 2026-07-06T10:01:00Z trace deadbeefcafe1234 said "boom"'
      ),
      row(
        'b',
        "req 11111111-2222-4333-8444-555555555555 from 192.168.0.1:80 at 2026-07-07T00:00:00Z trace 0123456789abcdef said 'kaboom'"
      ),
    ])
    expect(pattern.count).toBe(2)
    expect(pattern.template).toBe('req <*> from <*> at <*> trace <*> said <*>')
  })

  it('collapses consecutive wildcard tokens so variable-length segments group together', () => {
    const patterns = extractLogPatterns([row('a', 'took 12 34 56 ms end'), row('b', 'took 9 ms end')])
    expect(patterns).toHaveLength(1)
    expect(patterns[0].template).toBe('took <*> ms end')
  })

  it('sorts by count descending and caps at maxPatterns', () => {
    const rows = [
      row('a1', 'common event 1'),
      row('a2', 'common event 2'),
      row('a3', 'common event 3'),
      row('b1', 'rare thing'),
      row('c1', 'other thing'),
    ]
    const patterns = extractLogPatterns(rows, { maxPatterns: 2 })
    expect(patterns).toHaveLength(2)
    expect(patterns[0].template).toBe('common event <*>')
    expect(patterns[0].count).toBe(3)
  })
})

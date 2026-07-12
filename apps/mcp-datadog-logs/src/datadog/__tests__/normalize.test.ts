import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAPS,
  extractTraceId,
  formatAttributeValue,
  lookupAttribute,
  normalizeFacet,
  normalizeLogRow,
  normalizeStatus,
  normalizeTimeline,
  normalizeTimelineByFacet,
} from '../normalize.js'

describe('normalizeStatus', () => {
  it('maps aliases', () => {
    expect(normalizeStatus('warning')).toBe('warn')
    expect(normalizeStatus('WARNING')).toBe('warn')
    expect(normalizeStatus('critical')).toBe('error')
    expect(normalizeStatus('err')).toBe('error')
    expect(normalizeStatus(undefined)).toBe('info')
    expect(normalizeStatus('info')).toBe('info')
  })
})

describe('normalizeLogRow', () => {
  it('normalizes a full log event', () => {
    const row = normalizeLogRow({
      id: 'AQAAAY',
      attributes: {
        timestamp: new Date('2026-07-06T10:00:00Z'),
        status: 'error',
        service: 'payments',
        host: 'i-abc123',
        message: 'Payment failed: timeout',
        tags: ['env:prod', 'team:core'],
      },
    })
    expect(row).toEqual({
      id: 'AQAAAY',
      timestamp: '2026-07-06T10:00:00.000Z',
      status: 'error',
      service: 'payments',
      host: 'i-abc123',
      message: 'Payment failed: timeout',
      tags: ['env:prod', 'team:core'],
    })
  })

  it('truncates long messages and flags it', () => {
    const row = normalizeLogRow({
      id: 'x',
      attributes: { message: 'a'.repeat(600), timestamp: '2026-07-06T10:00:00Z' },
    })
    expect(row.message).toHaveLength(DEFAULT_CAPS.maxMessageLength)
    expect(row.messageTruncated).toBe(true)
  })

  it('caps tags', () => {
    const row = normalizeLogRow({
      id: 'x',
      attributes: {
        timestamp: '2026-07-06T10:00:00Z',
        tags: Array.from({ length: 30 }, (_, i) => `tag:${i}`),
      },
    })
    expect(row.tags).toHaveLength(DEFAULT_CAPS.maxTags)
  })

  it('falls back to nested host attribute', () => {
    const row = normalizeLogRow({
      id: 'x',
      attributes: { timestamp: '2026-07-06T10:00:00Z', attributes: { host: 'nested-host' } },
    })
    expect(row.host).toBe('nested-host')
  })
})

describe('extractTraceId', () => {
  it('reads the standard trace_id key', () => {
    expect(extractTraceId({ trace_id: 'abc123' })).toBe('abc123')
  })

  it('falls back to a flattened dd.trace_id key', () => {
    expect(extractTraceId({ 'dd.trace_id': 'flat-id' })).toBe('flat-id')
  })

  it('falls back to a nested dd object', () => {
    expect(extractTraceId({ dd: { trace_id: 'nested-id' } })).toBe('nested-id')
  })

  it('stringifies numeric trace ids', () => {
    expect(extractTraceId({ trace_id: 4711824721399429 })).toBe('4711824721399429')
  })

  it('rejects non-scalar values and missing bags', () => {
    expect(extractTraceId({ trace_id: { nope: true } })).toBeUndefined()
    expect(extractTraceId({})).toBeUndefined()
    expect(extractTraceId(undefined)).toBeUndefined()
  })
})

describe('lookupAttribute', () => {
  it('prefers a literal key containing dots over path traversal', () => {
    expect(lookupAttribute({ 'http.status_code': 402, http: { status_code: 500 } }, 'http.status_code')).toBe(402)
  })

  it('traverses nested objects by dot path', () => {
    expect(lookupAttribute({ http: { status_code: 500 } }, 'http.status_code')).toBe(500)
  })

  it('is null-safe on missing segments and scalar intermediates', () => {
    expect(lookupAttribute({ http: 'flat' }, 'http.status_code')).toBeUndefined()
    expect(lookupAttribute({ http: null }, 'http.status_code')).toBeUndefined()
    expect(lookupAttribute(undefined, 'http.status_code')).toBeUndefined()
  })
})

describe('formatAttributeValue', () => {
  it('keeps primitives as-is', () => {
    expect(formatAttributeValue(402)).toBe('402')
    expect(formatAttributeValue('CardError')).toBe('CardError')
    expect(formatAttributeValue(false)).toBe('false')
  })

  it('stringifies and truncates objects', () => {
    const value = { message: 'x'.repeat(200) }
    const text = formatAttributeValue(value)
    expect(text.startsWith('{"message":"xxx')).toBe(true)
    expect(text).toHaveLength(101)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('normalizeTimeline', () => {
  it('merges status buckets into per-time counts sorted by time', () => {
    const timeline = normalizeTimeline([
      {
        by: { status: 'error' },
        computes: {
          c0: [
            { time: '2026-07-06T10:05:00Z', value: 3 },
            { time: '2026-07-06T10:00:00Z', value: 5 },
          ],
        },
      },
      {
        by: { status: 'info' },
        computes: { c0: [{ time: '2026-07-06T10:00:00Z', value: 40 }] },
      },
    ])
    expect(timeline).toEqual([
      { time: '2026-07-06T10:00:00.000Z', counts: { error: 5, info: 40 } },
      { time: '2026-07-06T10:05:00.000Z', counts: { error: 3 } },
    ])
  })

  it('ignores non-timeseries computes and missing points', () => {
    expect(normalizeTimeline([{ by: { status: 'error' }, computes: { c0: 12 } }])).toEqual([])
  })

  it('preserves non-status facet values', () => {
    const timeline = normalizeTimelineByFacet(
      [
        {
          by: { host: 'API-HOST-01' },
          computes: { c0: [{ time: '2026-07-06T10:00:00Z', value: 7 }] },
        },
        {
          by: { '@http.status_code': 500 },
          computes: { c0: [{ time: '2026-07-06T10:00:00Z', value: 2 }] },
        },
      ],
      'host'
    )
    expect(timeline).toEqual([{ time: '2026-07-06T10:00:00.000Z', counts: { '500': 2, 'API-HOST-01': 7 } }])
  })
})

describe('normalizeFacet', () => {
  it('sorts by count and rolls up beyond the cap', () => {
    const buckets = Array.from({ length: 20 }, (_, i) => ({
      by: { service: `svc-${i}` },
      computes: { c0: i + 1 },
    }))
    const facet = normalizeFacet('service', buckets)
    expect(facet.values).toHaveLength(DEFAULT_CAPS.maxFacetValues)
    expect(facet.values[0]).toEqual({ value: 'svc-19', count: 20 })
    // 20 values total, top 15 kept → bottom 5 (counts 1..5) roll into other.
    expect(facet.otherCount).toBe(15)
  })

  it('handles empty buckets', () => {
    const facet = normalizeFacet('service', [])
    expect(facet).toEqual({ facet: 'service', values: [] })
  })
})

import { describe, expect, it } from 'vitest'
import {
  classifyEventKind,
  DEFAULT_CAPS,
  downsampleMetricPoints,
  extractTraceId,
  formatAttributeValue,
  lookupAttribute,
  normalizeEventMarker,
  normalizeFacet,
  normalizeLogRow,
  normalizeMetricSeries,
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

  it('extracts the trace id from custom attributes and omits it otherwise', () => {
    const withTrace = normalizeLogRow({
      id: 'x',
      attributes: { timestamp: '2026-07-06T10:00:00Z', attributes: { trace_id: 4711824721399429 } },
    })
    expect(withTrace.traceId).toBe('4711824721399429')

    const withoutTrace = normalizeLogRow({
      id: 'y',
      attributes: { timestamp: '2026-07-06T10:00:00Z' },
    })
    expect('traceId' in withoutTrace).toBe(false)
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

  it('stringifies objects and keeps values within the default cap intact', () => {
    const value = { message: 'x'.repeat(200) }
    expect(formatAttributeValue(value)).toBe(JSON.stringify(value))
  })

  it('middle-truncates long values so the tail survives', () => {
    const text = formatAttributeValue(`${'x'.repeat(400)}, StatusCode: 400, SomeException`)
    expect(text).toHaveLength(301)
    expect(text.startsWith('xxx')).toBe(true)
    expect(text).toContain('…')
    expect(text.endsWith(', StatusCode: 400, SomeException')).toBe(true)
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

describe('classifyEventKind / normalizeEventMarker', () => {
  it('classifies deploy sources and tags', () => {
    expect(classifyEventKind({ attributes: { attributes: { sourceTypeName: 'github' } } })).toBe('deploy')
    expect(classifyEventKind({ attributes: { attributes: { sourceTypeName: 'argocd' } } })).toBe('deploy')
    expect(classifyEventKind({ attributes: { tags: ['deployment:web'], attributes: {} } })).toBe('deploy')
  })

  it('classifies alerts, winning over deploy-looking tags', () => {
    expect(classifyEventKind({ attributes: { attributes: { sourceTypeName: 'alert' } } })).toBe('alert')
    expect(classifyEventKind({ attributes: { tags: ['monitor:123', 'deploy:web'], attributes: {} } })).toBe('alert')
  })

  it('falls back to other', () => {
    expect(classifyEventKind({ attributes: { attributes: { sourceTypeName: 'custom' } } })).toBe('other')
    expect(classifyEventKind({})).toBe('other')
  })

  it('normalizes a raw event into a marker with truncated title and capped tags', () => {
    const marker = normalizeEventMarker({
      id: 'e1',
      attributes: {
        timestamp: new Date('2026-07-14T09:12:00Z'),
        tags: Array.from({ length: 30 }, (_, i) => `tag:${i}`),
        attributes: { title: `Deploy ${'x'.repeat(200)}`, status: 'info', sourceTypeName: 'github' },
      },
    })
    expect(marker.id).toBe('e1')
    expect(marker.time).toBe('2026-07-14T09:12:00.000Z')
    expect(marker.kind).toBe('deploy')
    expect(marker.title.endsWith('…')).toBe(true)
    expect(marker.title.length).toBe(161)
    expect(marker.source).toBe('github')
    expect(marker.status).toBe('info')
    expect(marker.tags).toHaveLength(DEFAULT_CAPS.maxTags)
  })

  it('falls back to the message and (no title)', () => {
    expect(normalizeEventMarker({ attributes: { timestamp: '2026-07-14T09:12:00Z', message: 'msg' } }).title).toBe(
      'msg'
    )
    expect(normalizeEventMarker({ attributes: { timestamp: '2026-07-14T09:12:00Z' } }).title).toBe('(no title)')
  })
})

describe('normalizeMetricSeries', () => {
  const startMs = Date.parse('2026-07-14T09:00:00Z')
  const pointlist = (values: Array<number | null>) => values.map((v, i) => [startMs + i * 60_000, v])

  it('converts pointlists, extracts unit/scope, and computes stats over raw values', () => {
    const series = normalizeMetricSeries('avg:system.cpu.user{*} by {host}', [
      {
        metric: 'avg:system.cpu.user',
        scope: 'host:i-0a1b',
        unit: [{ shortName: '%' }],
        pointlist: pointlist([10, null, 30]),
      },
    ])
    expect(series).toHaveLength(1)
    expect(series[0].metric).toBe('avg:system.cpu.user')
    expect(series[0].scope).toBe('host:i-0a1b')
    expect(series[0].unit).toBe('%')
    expect(series[0].points).toEqual([
      { time: '2026-07-14T09:00:00.000Z', value: 10 },
      { time: '2026-07-14T09:01:00.000Z', value: null },
      { time: '2026-07-14T09:02:00.000Z', value: 30 },
    ])
    expect(series[0].stats).toEqual({ min: 10, max: 30, avg: 20, last: 30 })
  })

  it('omits a "*" scope and drops series without points', () => {
    const series = normalizeMetricSeries('q', [
      { metric: 'm', scope: '*', pointlist: pointlist([1]) },
      { metric: 'empty', pointlist: [] },
      { metric: 'no-pointlist' },
    ])
    expect(series).toHaveLength(1)
    expect(series[0].scope).toBeUndefined()
  })

  it('caps the series count, keeping the highest averages first', () => {
    const raw = Array.from({ length: 15 }, (_, i) => ({
      metric: 'm',
      scope: `host:${i}`,
      pointlist: pointlist([i]),
    }))
    const series = normalizeMetricSeries('q', raw)
    expect(series).toHaveLength(10)
    expect(series[0].scope).toBe('host:14')
    expect(series[9].scope).toBe('host:5')
  })

  it('downsamples to at most 60 points', () => {
    const raw = [{ metric: 'm', pointlist: pointlist(Array.from({ length: 300 }, (_, i) => i)) }]
    const series = normalizeMetricSeries('q', raw)
    expect(series[0].points.length).toBeLessThanOrEqual(60)
    // Stats still reflect the raw, pre-downsample values.
    expect(series[0].stats.min).toBe(0)
    expect(series[0].stats.max).toBe(299)
  })
})

describe('downsampleMetricPoints', () => {
  it('returns short series untouched', () => {
    const points = [{ time: 't1', value: 1 }]
    expect(downsampleMetricPoints(points, 60)).toBe(points)
  })

  it('chunk-averages values and keeps all-null chunks as gaps', () => {
    const points = [
      { time: 't1', value: 10 },
      { time: 't2', value: 20 },
      { time: 't3', value: null },
      { time: 't4', value: null },
    ]
    expect(downsampleMetricPoints(points, 2)).toEqual([
      { time: 't1', value: 15 },
      { time: 't3', value: null },
    ])
  })
})

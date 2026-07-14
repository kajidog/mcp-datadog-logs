import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatadogLogsClient } from '../client.js'
import { extractTraceCandidates, runInvestigation } from '../investigation.js'
import type { RawLog } from '../normalize.js'

const FROM = '2026-07-14T09:00:00Z'
const TO = '2026-07-14T10:00:00Z'

function rawLog(id: string, overrides: Partial<NonNullable<RawLog['attributes']>> = {}): RawLog {
  return {
    id,
    attributes: {
      timestamp: '2026-07-14T09:30:00Z',
      status: 'error',
      service: 'payments',
      message: `boom ${id}`,
      ...overrides,
    },
  }
}

function fakeClient() {
  return {
    searchLogs: vi.fn().mockResolvedValue({ logs: [rawLog('log-1', { attributes: { trace_id: 'trace-a' } })] }),
    aggregateTimeseriesByStatus: vi.fn().mockResolvedValue([]),
    aggregateByFacet: vi.fn().mockResolvedValue([]),
    searchEvents: vi.fn().mockResolvedValue([
      {
        id: 'e1',
        attributes: {
          timestamp: '2026-07-14T09:15:00Z',
          attributes: { title: 'Deploy web v2', sourceTypeName: 'github', status: 'info' },
        },
      },
    ]),
    queryMetrics: vi.fn().mockResolvedValue([
      {
        metric: 'avg:system.cpu.user',
        pointlist: [[Date.parse(FROM), 10]],
      },
    ]),
  }
}

describe('runInvestigation cross-source fetches', () => {
  let client: ReturnType<typeof fakeClient>

  beforeEach(() => {
    client = fakeClient()
  })

  const run = (params: Record<string, unknown> = {}) =>
    runInvestigation(client as unknown as DatadogLogsClient, { query: '*', from: FROM, to: TO, ...params })

  it('fetches events by default and stores sorted markers', async () => {
    const { result } = await run()
    expect(client.searchEvents).toHaveBeenCalledWith({ query: '*', from: FROM, to: TO, limit: 30 })
    expect(result.events).toHaveLength(1)
    expect(result.events?.[0]).toMatchObject({ id: 'e1', kind: 'deploy', title: 'Deploy web v2' })
    expect(result.notices).toBeUndefined()
  })

  it('passes eventsQuery through and skips events with includeEvents: false', async () => {
    await run({ eventsQuery: 'source:github' })
    expect(client.searchEvents).toHaveBeenCalledWith(expect.objectContaining({ query: 'source:github' }))

    client.searchEvents.mockClear()
    const { result } = await run({ includeEvents: false })
    expect(client.searchEvents).not.toHaveBeenCalled()
    expect(result.events).toBeUndefined()
  })

  it('fetches each metrics query with the resolved range in epoch seconds', async () => {
    const { result } = await run({ metricsQueries: ['avg:system.cpu.user{*}', 'avg:trace.req{*}'] })
    expect(client.queryMetrics).toHaveBeenCalledTimes(2)
    expect(client.queryMetrics).toHaveBeenCalledWith({
      query: 'avg:system.cpu.user{*}',
      fromSec: Math.floor(Date.parse(FROM) / 1000),
      toSec: Math.floor(Date.parse(TO) / 1000),
    })
    expect(result.metrics).toHaveLength(2)
  })

  it('caps metricsQueries at 4', async () => {
    await run({ metricsQueries: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] })
    expect(client.queryMetrics).toHaveBeenCalledTimes(4)
  })

  it('skips events and metrics on load-more (cursor) pages', async () => {
    const { result } = await run({ cursor: 'page-2', metricsQueries: ['q1'] })
    expect(client.searchEvents).not.toHaveBeenCalled()
    expect(client.queryMetrics).not.toHaveBeenCalled()
    expect(result.events).toBeUndefined()
    expect(result.metrics).toBeUndefined()
  })

  it('degrades gracefully when the events scope is missing', async () => {
    client.searchEvents.mockRejectedValue({ code: 403, message: 'Forbidden' })
    const { result } = await run()
    expect(result.events).toBeUndefined()
    expect(result.notices).toHaveLength(1)
    expect(result.notices?.[0]).toContain('Events unavailable')
    expect(result.notices?.[0]).toContain('events_read')
    expect(result.rows).toHaveLength(1)
  })

  it('continues with the remaining metric queries when one fails', async () => {
    client.queryMetrics.mockRejectedValueOnce({ code: 403, message: 'Forbidden' })
    const { result } = await run({ metricsQueries: ['bad{*}', 'good{*}'] })
    expect(result.metrics).toHaveLength(1)
    expect(result.notices?.[0]).toContain('bad{*}')
    expect(result.notices?.[0]).toContain('timeseries_query')
  })

  it('extracts trace candidates from the fetched rows', async () => {
    client.searchLogs.mockResolvedValue({
      logs: [
        rawLog('log-1', { attributes: { trace_id: 'trace-a' } }),
        rawLog('log-2', { attributes: { trace_id: 'trace-a' } }),
        rawLog('log-3', { status: 'info', attributes: { trace_id: 'trace-b' } }),
        rawLog('log-4'),
      ],
    })
    const { result } = await run()
    expect(result.traceCandidates?.map((c) => c.traceId)).toEqual(['trace-a', 'trace-b'])
    expect(result.traceCandidates?.[0]).toMatchObject({ count: 2, errorCount: 2, services: ['payments'] })
  })

  it('produces the legacy result shape when cross-source data is absent', async () => {
    client.searchLogs.mockResolvedValue({ logs: [rawLog('log-1')] })
    const { result } = await run({ includeEvents: false })
    expect(Object.keys(result)).not.toContain('events')
    expect(Object.keys(result)).not.toContain('metrics')
    expect(Object.keys(result)).not.toContain('traceCandidates')
    expect(Object.keys(result)).not.toContain('notices')
  })
})

describe('extractTraceCandidates', () => {
  const row = (id: string, traceId: string | undefined, status = 'error', timestamp = '2026-07-14T09:30:00.000Z') => ({
    id,
    timestamp,
    status,
    service: 'payments',
    message: `msg ${id}`,
    ...(traceId ? { traceId } : {}),
  })

  it('sorts by error count, then row count, and caps the list', () => {
    const rows = [
      row('1', 'a', 'info'),
      row('2', 'a', 'info'),
      row('3', 'a', 'info'),
      row('4', 'b'),
      row('5', 'b'),
      row('6', 'c'),
      row('7', undefined),
    ]
    const candidates = extractTraceCandidates(rows, 2)
    expect(candidates.map((c) => c.traceId)).toEqual(['b', 'c'])
    expect(candidates[0]).toMatchObject({ count: 2, errorCount: 2 })
  })

  it('tracks the earliest timestamp and prefers an error message as the sample', () => {
    const rows = [row('1', 'a', 'info', '2026-07-14T09:10:00.000Z'), row('2', 'a', 'error', '2026-07-14T09:20:00.000Z')]
    const [candidate] = extractTraceCandidates(rows)
    expect(candidate.firstSeen).toBe('2026-07-14T09:10:00.000Z')
    expect(candidate.sampleMessage).toBe('msg 2')
  })

  it('returns an empty list when no rows carry a trace id', () => {
    expect(extractTraceCandidates([row('1', undefined)])).toEqual([])
  })
})

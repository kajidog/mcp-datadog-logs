import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMetrics } = vi.hoisted(() => ({ queryMetrics: vi.fn() }))

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient: () => ({ queryMetrics }),
}))

import { createServer } from '../../server.js'

const FROM_ISO = '2026-07-14T09:00:00Z'
const TO_ISO = '2026-07-14T10:00:00Z'

function series(scope: string, values: number[], startMs = Date.parse(FROM_ISO)) {
  return {
    metric: 'avg:system.cpu.user',
    scope,
    unit: [{ shortName: '%' }],
    pointlist: values.map((value, i) => [startMs + i * 60_000, value]),
  }
}

describe('datadog_query_metrics', () => {
  beforeEach(() => {
    queryMetrics.mockReset()
  })

  it('converts the resolved range to epoch seconds for the v1 query API', async () => {
    queryMetrics.mockResolvedValue([series('host:a', [1, 2, 3])])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    await tool.handler({ query: 'avg:system.cpu.user{*}', from: FROM_ISO, to: TO_ISO, max_series: 10 })

    expect(queryMetrics).toHaveBeenCalledWith({
      query: 'avg:system.cpu.user{*}',
      fromSec: Math.floor(Date.parse(FROM_ISO) / 1000),
      toSec: Math.floor(Date.parse(TO_ISO) / 1000),
    })
  })

  it('renders one stats line and one downsampled value line per series', async () => {
    queryMetrics.mockResolvedValue([series('host:a', [10, 20, 30, 40])])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    const result = await tool.handler({ query: 'avg:system.cpu.user{*}', from: FROM_ISO, to: TO_ISO, max_series: 10 })

    const lines = result.content[0].text.split('\n')
    expect(lines[0]).toBe(`1 series (query: avg:system.cpu.user{*}, range: ${FROM_ISO} → ${TO_ISO})`)
    expect(lines[1]).toBe('avg:system.cpu.user host:a [%] min 10 avg 25 max 40 last 40')
    expect(lines[2]).toContain('(4pts): 10 20 30 40')
  })

  it('caps group-by fan-out at max_series, keeping the highest averages', async () => {
    queryMetrics.mockResolvedValue([
      series('host:low', [1, 1]),
      series('host:high', [100, 100]),
      series('host:mid', [50, 50]),
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    const result = await tool.handler({
      query: 'avg:system.cpu.user{*} by {host}',
      from: FROM_ISO,
      to: TO_ISO,
      max_series: 2,
    })

    const text = result.content[0].text
    expect(text).toContain('(showing top 2 of 3 series)')
    expect(text).toContain('host:high')
    expect(text).toContain('host:mid')
    expect(text).not.toContain('host:low')
  })

  it('renders null points as "-" without polluting the stats', async () => {
    queryMetrics.mockResolvedValue([
      {
        metric: 'avg:system.cpu.user',
        pointlist: [
          [Date.parse(FROM_ISO), 10],
          [Date.parse(FROM_ISO) + 60_000, null],
          [Date.parse(FROM_ISO) + 120_000, 30],
        ],
      },
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    const result = await tool.handler({ query: 'avg:system.cpu.user{*}', from: FROM_ISO, to: TO_ISO, max_series: 10 })

    const lines = result.content[0].text.split('\n')
    expect(lines[1]).toBe('avg:system.cpu.user min 10 avg 20 max 30 last 30')
    expect(lines[2]).toContain('10 - 30')
  })

  it('reports when no series matched', async () => {
    queryMetrics.mockResolvedValue([])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    const result = await tool.handler({ query: 'avg:missing.metric{*}', from: 'now-1h', to: 'now', max_series: 10 })

    expect(result.content[0].text).toBe('No series matched query "avg:missing.metric{*}" between now-1h and now.')
  })

  it('rejects timezone-less absolute timestamps before calling Datadog', async () => {
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    const result = await tool.handler({
      query: 'avg:system.cpu.user{*}',
      from: '2026-07-06T10:00:00',
      to: '2026-07-06T11:00:00',
      max_series: 10,
    })

    expect(queryMetrics).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('must include a time zone')
  })

  it('names the timeseries_query scope on 403 responses', async () => {
    queryMetrics.mockRejectedValue({ code: 403, message: 'Forbidden' })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_query_metrics

    const result = await tool.handler({ query: 'avg:system.cpu.user{*}', from: 'now-1h', to: 'now', max_series: 10 })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('timeseries_query')
    expect(result.content[0].text).not.toContain('logs_read_data')
  })
})

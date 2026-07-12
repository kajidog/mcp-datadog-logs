import { beforeEach, describe, expect, it, vi } from 'vitest'

const { aggregateTimeseriesByFacet } = vi.hoisted(() => ({ aggregateTimeseriesByFacet: vi.fn() }))

vi.mock('../../datadog/client.js', () => ({
  getDatadogClient: () => ({ aggregateTimeseriesByFacet }),
}))

import { createServer } from '../../server.js'

describe('datadog_aggregate_logs', () => {
  beforeEach(() => {
    aggregateTimeseriesByFacet.mockReset()
  })

  it('applies groupBy to interval aggregations and labels the result with that facet', async () => {
    aggregateTimeseriesByFacet.mockResolvedValue([
      {
        by: { host: 'API-HOST-01' },
        computes: { c0: [{ time: '2026-07-06T10:00:00Z', value: 7 }] },
      },
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_aggregate_logs

    const result = await tool.handler({
      query: 'service:web',
      from: 'now-1h',
      to: 'now',
      groupBy: 'host',
      interval: '15m',
    })

    expect(aggregateTimeseriesByFacet).toHaveBeenCalledWith({
      query: 'service:web',
      from: 'now-1h',
      to: 'now',
      interval: '15m',
      facet: 'host',
    })
    expect(result.content[0].text).toBe(
      'Log counts by host per 15m (query: service:web)\n2026-07-06T10:00:00.000Z  API-HOST-01=7'
    )
  })
})

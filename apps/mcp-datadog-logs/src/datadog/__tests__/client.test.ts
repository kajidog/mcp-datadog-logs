import { describe, expect, it, vi } from 'vitest'
import { DatadogLogsClient } from '../client.js'

function createClient() {
  const aggregateLogs = vi.fn().mockResolvedValue({ data: { buckets: [] } })
  const client = new DatadogLogsClient({
    apiKey: 'test-api-key',
    appKey: 'test-app-key',
    site: 'datadoghq.com',
  })
  ;(client as unknown as { api: { aggregateLogs: typeof aggregateLogs } }).api = { aggregateLogs }
  return { client, aggregateLogs }
}

describe('DatadogLogsClient aggregation', () => {
  it('uses the requested facet for a timeseries aggregation', async () => {
    const { client, aggregateLogs } = createClient()

    await client.aggregateTimeseriesByFacet({
      query: 'service:web',
      from: 'now-1h',
      to: 'now',
      interval: '15m',
      facet: 'host',
    })

    expect(aggregateLogs).toHaveBeenCalledWith({
      body: {
        compute: [{ aggregation: 'count', type: 'timeseries', interval: '15m' }],
        filter: { query: 'service:web', from: 'now-1h', to: 'now' },
        groupBy: [{ facet: 'host', limit: 50 }],
      },
    })
  })

  it('keeps the investigation status timeline capped at 10 values', async () => {
    const { client, aggregateLogs } = createClient()

    await client.aggregateTimeseriesByStatus({ query: '*', from: 'now-15m', to: 'now', interval: '5m' })

    expect(aggregateLogs.mock.calls[0][0].body.groupBy).toEqual([{ facet: 'status', limit: 10 }])
  })
})

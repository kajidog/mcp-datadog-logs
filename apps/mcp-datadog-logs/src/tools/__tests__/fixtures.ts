import type { InvestigationResult, LogRow } from '@kajidog/investigation-shared'
import type { RawLog } from '../../datadog/normalize.js'

export function fixtureRow(id: string, overrides: Partial<LogRow> = {}): LogRow {
  return {
    id,
    timestamp: '2026-07-06T10:01:00.000Z',
    status: 'error',
    service: 'payments',
    host: 'i-0a1b2c',
    message: `Payment failed: upstream timeout (${id})`,
    ...overrides,
  }
}

export function fixtureResult(overrides: Partial<InvestigationResult> = {}): InvestigationResult {
  return {
    params: { query: 'service:payments status:error', from: 'now-1h', to: 'now' },
    totalCount: 1234,
    timeline: [{ time: '2026-07-06T10:00:00.000Z', counts: { error: 5, info: 40 } }],
    interval: '5m',
    facets: [
      {
        facet: 'status',
        values: [
          { value: 'error', count: 120 },
          { value: 'warn', count: 90 },
          { value: 'info', count: 980 },
        ],
      },
      {
        facet: 'service',
        values: [
          { value: 'payments', count: 400 },
          { value: 'checkout', count: 330 },
          { value: 'auth', count: 260 },
          { value: 'search', count: 110 },
        ],
        otherCount: 42,
      },
      { facet: 'host', values: [{ value: 'i-0a1b2c', count: 500 }] },
    ],
    rows: [fixtureRow('log-1'), fixtureRow('log-2'), fixtureRow('log-3'), fixtureRow('log-4')],
    fetchedAt: '2026-07-06T10:10:00.000Z',
    resolvedRange: { fromMs: Date.parse('2026-07-06T09:10:00Z'), toMs: Date.parse('2026-07-06T10:10:00Z') },
    ...overrides,
  }
}

export function fixtureRawById(result: InvestigationResult): Map<string, RawLog> {
  return new Map<string, RawLog>(result.rows.map((row) => [row.id, { id: row.id }]))
}

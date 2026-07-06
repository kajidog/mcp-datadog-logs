import type { InvestigationResult } from '@kajidog/investigation-shared'
import type { App } from '@modelcontextprotocol/ext-apps'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export const MOCK_VIEW_UUID = '00000000-0000-4000-8000-000000000000'

const SERVICES = ['payments', 'checkout', 'auth', 'search', 'notifications']
const HOSTS = ['i-0a1b2c', 'i-3d4e5f', 'i-6a7b8c']
const MESSAGES = [
  'Payment failed: upstream timeout after 30s',
  'Request completed status=200 duration=124ms',
  'Retrying connection to redis (attempt 3/5)',
  'Deprecation warning: field "amount_cents" will be removed',
  'Unhandled exception in worker: NullPointerException at PaymentProcessor.charge',
  'Slow query detected: SELECT * FROM orders WHERE ... (2.4s)',
]

function mockResult(query: string, from: string, to: string): InvestigationResult {
  const now = Date.now()
  const buckets = 24
  const stepMs = 5 * 60_000
  const timeline = Array.from({ length: buckets }, (_, i) => {
    const spike = i === 15 || i === 16 ? 4 : 1
    return {
      time: new Date(now - (buckets - i) * stepMs).toISOString(),
      counts: {
        info: Math.round(30 + 20 * Math.sin(i / 3) + 10 * Math.random()),
        warn: Math.round(3 + 2 * Math.random()) * spike,
        error: Math.round(1 + 2 * Math.random()) * spike * spike,
        debug: Math.round(5 + 3 * Math.random()),
      },
    }
  })
  const rows = Array.from({ length: 50 }, (_, i) => ({
    id: `mock-log-${i}`,
    timestamp: new Date(now - i * 90_000).toISOString(),
    status: (['error', 'warn', 'info', 'info', 'info', 'debug'] as const)[i % 6],
    service: SERVICES[i % SERVICES.length],
    host: HOSTS[i % HOSTS.length],
    message: MESSAGES[i % MESSAGES.length],
    tags: ['env:prod', `team:core-${i % 3}`],
  }))
  return {
    params: { query, from, to },
    totalCount: 1234,
    timeline,
    interval: '5m',
    facets: [
      {
        facet: 'service',
        values: SERVICES.map((s, i) => ({ value: s, count: 400 - i * 70 })),
        otherCount: 42,
      },
      {
        facet: 'status',
        values: [
          { value: 'info', count: 980 },
          { value: 'error', count: 120 },
          { value: 'warn', count: 90 },
          { value: 'debug', count: 44 },
        ],
      },
      {
        facet: 'host',
        values: HOSTS.map((h, i) => ({ value: h, count: 500 - i * 120 })),
      },
    ],
    rows,
    nextCursor: 'mock-cursor',
    fetchedAt: new Date().toISOString(),
    resolvedRange: { fromMs: now - buckets * stepMs, toMs: now },
  }
}

/**
 * DEV-only stand-in for the MCP Apps bridge so `vite dev` renders in a plain
 * browser without a host or Datadog credentials.
 */
export function createMockApp(): App {
  let current = mockResult('service:payments status:error', 'now-2h', 'now')
  const mock = {
    async callServerTool({ name, arguments: args }: { name: string; arguments: any }): Promise<CallToolResult> {
      await new Promise((r) => setTimeout(r, 300))
      switch (name) {
        case '_get_view_state':
          return json(current)
        case '_run_investigation': {
          current = mockResult(args.query, args.from, args.to)
          if (args.cursor) {
            current = { ...current, rows: [...current.rows] }
          }
          return json(current)
        }
        case '_get_log_detail':
          return json({
            id: args.logId,
            attributes: {
              timestamp: new Date().toISOString(),
              status: 'error',
              service: 'payments',
              message: 'Payment failed: upstream timeout after 30s',
              attributes: { http: { status_code: 504, url: '/api/v1/charge' }, duration: 30012 },
              tags: ['env:prod', 'team:core'],
            },
          })
        case '_export_report':
          return json({ ok: true, path: '/home/dev/Downloads/datadog-logs-report-20260706-120000.html' })
        default:
          return json({ notFound: true })
      }
    },
  }
  return mock as unknown as App
}

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

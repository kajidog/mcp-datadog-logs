import type {
  EventMarker,
  InvestigationResult,
  LogPattern,
  LogRow,
  MetricSeries,
  TraceCandidate,
} from '@kajidog/investigation-shared'
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
  const rows: LogRow[] = Array.from({ length: 50 }, (_, i) => ({
    id: `mock-log-${i}`,
    timestamp: new Date(now - i * 90_000).toISOString(),
    status: (['error', 'warn', 'info', 'info', 'info', 'debug'] as const)[i % 6],
    service: SERVICES[i % SERVICES.length],
    host: HOSTS[i % HOSTS.length],
    message: MESSAGES[i % MESSAGES.length],
    tags: ['env:prod', `team:core-${i % 3}`],
    // Error rows carry a trace id so the trace chip / candidates render in dev.
    ...(i % 6 === 0 ? { traceId: `${4200000000000000 + Math.floor(i / 6)}` } : {}),
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
    patterns: mockPatterns(rows),
    nextCursor: 'mock-cursor',
    findings:
      'payments サービスで 12:00 以降 upstream timeout が急増。\n' +
      '直前のデプロイ (v2.31.0) と時間帯が一致しており、DB コネクションプール枯渇の可能性が高い。',
    fetchedAt: new Date().toISOString(),
    resolvedRange: { fromMs: now - buckets * stepMs, toMs: now },
    events: mockEvents(now, buckets, stepMs),
    metrics: mockMetrics(now, buckets, stepMs),
    traceCandidates: mockTraceCandidates(rows),
    notices: ['Metric query "avg:system.memory.pct_usable{*}" failed: (mock notice for dev layout check)'],
  }
}

function mockEvents(now: number, buckets: number, stepMs: number): EventMarker[] {
  return [
    {
      id: 'mock-event-deploy',
      // Right at the error-spike buckets (i = 15/16 in the timeline above).
      time: new Date(now - (buckets - 15) * stepMs).toISOString(),
      kind: 'deploy',
      title: 'Deployed payments v2.31.0 (github)',
      status: 'info',
      source: 'github',
      tags: ['service:payments', 'env:prod'],
    },
    {
      id: 'mock-event-alert',
      time: new Date(now - (buckets - 18) * stepMs).toISOString(),
      kind: 'alert',
      title: '[Triggered] payments error rate is above 5%',
      status: 'error',
      source: 'alert',
      tags: ['monitor', 'service:payments'],
    },
    {
      id: 'mock-event-other',
      time: new Date(now - (buckets - 5) * stepMs).toISOString(),
      kind: 'other',
      title: 'Feature flag "new-checkout" enabled for 25% of traffic',
      source: 'custom',
    },
  ]
}

function mockMetrics(now: number, buckets: number, stepMs: number): MetricSeries[] {
  const points = (base: number, spikeAt: number, spikeScale: number) =>
    Array.from({ length: buckets }, (_, i) => ({
      time: new Date(now - (buckets - i) * stepMs).toISOString(),
      value:
        i === 10
          ? null // gap so connectNulls=false rendering is visible in dev
          : Math.round((base + 10 * Math.sin(i / 3) + (i >= spikeAt ? spikeScale * (i - spikeAt) : 0)) * 10) / 10,
    }))
  const stats = (pts: Array<{ value: number | null }>) => {
    const values = pts.map((p) => p.value).filter((v): v is number => v !== null)
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
      last: values[values.length - 1] ?? null,
    }
  }
  const cpu = points(45, 15, 8)
  const latency = points(120, 15, 60)
  return [
    {
      query: 'avg:system.cpu.user{service:payments}',
      metric: 'avg:system.cpu.user',
      scope: 'service:payments',
      unit: '%',
      points: cpu,
      stats: stats(cpu),
    },
    {
      query: 'avg:trace.express.request.duration{service:payments}',
      metric: 'avg:trace.express.request.duration',
      scope: 'service:payments',
      unit: 'ms',
      points: latency,
      stats: stats(latency),
    },
  ]
}

function mockTraceCandidates(rows: LogRow[]): TraceCandidate[] {
  const withTrace = rows.filter((row) => row.traceId)
  return withTrace.slice(0, 3).map((row) => ({
    traceId: row.traceId ?? '',
    count: 5,
    errorCount: 4,
    firstSeen: row.timestamp,
    services: [row.service ?? 'payments'],
    sampleMessage: row.message,
  }))
}

/** Same shape the server produces: rows grouped by message template, most frequent first. */
function mockPatterns(rows: LogRow[]): LogPattern[] {
  const groups = new Map<string, { example: string; rowIds: string[] }>()
  for (const row of rows) {
    const template = row.message.replace(/\d+(?:\.\d+)?[a-z]*/g, '<*>').replace(/"[^"]*"/g, '<*>')
    const group = groups.get(template)
    if (group) {
      group.rowIds.push(row.id)
    } else {
      groups.set(template, { example: row.message, rowIds: [row.id] })
    }
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => b.rowIds.length - a.rowIds.length)
    .map(([template, group]) => ({
      template,
      count: group.rowIds.length,
      ratio: group.rowIds.length / rows.length,
      example: group.example,
      rowIds: group.rowIds,
    }))
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
        case '_export_report': {
          const format = args.format ?? 'html'
          return json({
            ok: true,
            path: `/home/dev/Downloads/datadog-logs-report-20260706-120000.${format}`,
            opened: format === 'html',
          })
        }
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

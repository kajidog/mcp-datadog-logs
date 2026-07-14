import type { MetricSeries } from '@kajidog/investigation-shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../datadog/client.js'
import { normalizeMetricSeries } from '../datadog/normalize.js'
import { resolveRange } from '../datadog/time.js'
import { registerPrefixedTool } from './registration.js'
import { createErrorResponse, textResult } from './utils.js'

const VALUE_LINE_POINTS = 20

function formatValue(value: number | null): string {
  if (value === null) {
    return '-'
  }
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 100000 || abs < 0.01)) {
    return value.toExponential(2)
  }
  return String(Math.round(value * 100) / 100)
}

function shortTime(iso: string): string {
  // 2026-07-14T12:34:56.000Z -> 07-14 12:34
  const match = iso.match(/^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2})/)
  return match ? `${match[1]} ${match[2]}` : iso
}

/** One stats line per series, e.g. "avg:system.cpu.user host:i-0a1b [%] min 12.3 avg 45.6 max 98.7 last 50.1". */
export function formatMetricStatsLine(series: MetricSeries): string {
  const parts = [series.metric]
  if (series.scope) {
    parts.push(series.scope)
  }
  if (series.unit) {
    parts.push(`[${series.unit}]`)
  }
  const { min, avg, max, last } = series.stats
  parts.push(`min ${formatValue(min)} avg ${formatValue(avg)} max ${formatValue(max)} last ${formatValue(last)}`)
  return parts.join(' ')
}

/** Stats line + one downsampled value line per series. */
export function formatMetricSeriesLines(series: MetricSeries): string[] {
  const points = series.points
  const step = Math.max(1, Math.ceil(points.length / VALUE_LINE_POINTS))
  const sampled = points.filter((_, i) => i % step === 0)
  const first = points[0]
  const lastPoint = points[points.length - 1]
  const valueLine =
    points.length > 0
      ? `  ${shortTime(first.time)}→${shortTime(lastPoint.time)} (${points.length}pts): ${sampled
          .map((p) => formatValue(p.value))
          .join(' ')}`
      : '  (no points)'
  return [formatMetricStatsLine(series), valueLine]
}

export function registerQueryMetricsTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'query_metrics',
    {
      title: 'Query Datadog Metrics',
      description:
        'Query Datadog metric timeseries with the classic metric query syntax and return compact per-series stats ' +
        'plus downsampled values. Use it to correlate resource/latency behavior with a log error window: e.g. ' +
        '"avg:system.cpu.user{service:web} by {host}", "avg:trace.express.request.duration{service:api}", ' +
        '"sum:trace.express.request.errors{service:api}.as_count()".',
      inputSchema: {
        query: z.string().describe('Datadog metric query, e.g. "avg:system.cpu.user{service:web} by {host}"'),
        from: z
          .string()
          .default('now-1h')
          .describe('Start time: Datadog time math ("now-1h") or ISO 8601 with a time zone (Z or offset)'),
        to: z
          .string()
          .default('now')
          .describe('End time: Datadog time math ("now") or ISO 8601 with a time zone (Z or offset)'),
        max_series: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(10)
          .describe('Max series to return for group-by queries (highest average first)'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({
      query,
      from,
      to,
      max_series,
    }: {
      query: string
      from: string
      to: string
      max_series: number
    }): Promise<CallToolResult> => {
      try {
        const resolved = resolveRange(from, to)
        const client = getDatadogClient()
        const raw = await client.queryMetrics({
          query,
          fromSec: Math.floor(resolved.fromMs / 1000),
          toSec: Math.floor(resolved.toMs / 1000),
        })
        const series = normalizeMetricSeries(query, raw, max_series)
        if (series.length === 0) {
          return textResult(`No series matched query "${query}" between ${from} and ${to}.`)
        }
        const overflow = raw.length > series.length ? ` (showing top ${series.length} of ${raw.length} series)` : ''
        const header = `${series.length} series (query: ${query}, range: ${from} → ${to})${overflow}`
        return textResult(`${header}\n${series.flatMap((s) => formatMetricSeriesLines(s)).join('\n')}`)
      } catch (error) {
        return createErrorResponse(error, 'timeseries_query')
      }
    }
  )
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../datadog/client.js'
import { normalizeFacet, normalizeTimeline } from '../datadog/normalize.js'
import { registerPrefixedTool } from './registration.js'
import { createErrorResponse, textResult } from './utils.js'

export function registerAggregateLogsTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'aggregate_logs',
    {
      title: 'Aggregate Datadog Logs',
      description:
        'Count Datadog logs grouped by a facet (e.g. service, status, host, @http.status_code), ' +
        'or as a timeseries when interval is set. Returns a text table for model-side analysis.',
      inputSchema: {
        query: z.string().default('*').describe('Datadog logs search query'),
        from: z.string().default('now-15m').describe('Start time: Datadog time math or ISO 8601'),
        to: z.string().default('now').describe('End time'),
        groupBy: z
          .string()
          .optional()
          .describe('Facet to group by, e.g. "service", "status", "host", "@http.status_code". Defaults to "status".'),
        interval: z
          .string()
          .optional()
          .describe('When set (e.g. "5m", "1h"), returns a timeseries of counts instead of totals'),
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
      groupBy,
      interval,
    }: {
      query: string
      from: string
      to: string
      groupBy?: string
      interval?: string
    }): Promise<CallToolResult> => {
      try {
        const client = getDatadogClient()
        const facet = groupBy ?? 'status'
        if (interval) {
          const buckets = await client.aggregateTimeseriesByStatus({ query, from, to, interval })
          const timeline = normalizeTimeline(buckets)
          if (timeline.length === 0) {
            return textResult(`No logs matched query "${query}" between ${from} and ${to}.`)
          }
          const statuses = [...new Set(timeline.flatMap((b) => Object.keys(b.counts)))].sort()
          const lines = timeline.map((b) => {
            const counts = statuses.map((s) => `${s}=${b.counts[s] ?? 0}`).join(' ')
            return `${b.time}  ${counts}`
          })
          return textResult(`Log counts by status per ${interval} (query: ${query})\n${lines.join('\n')}`)
        }
        const buckets = await client.aggregateByFacet({ query, from, to, facet })
        const breakdown = normalizeFacet(facet, buckets)
        if (breakdown.values.length === 0) {
          return textResult(`No logs matched query "${query}" between ${from} and ${to}.`)
        }
        const width = Math.max(...breakdown.values.map((v) => v.value.length), facet.length)
        const lines = breakdown.values.map((v) => `${v.value.padEnd(width)}  ${v.count}`)
        if (breakdown.otherCount) {
          lines.push(`${'(other)'.padEnd(width)}  ${breakdown.otherCount}`)
        }
        const total = breakdown.values.reduce((s, v) => s + v.count, 0) + (breakdown.otherCount ?? 0)
        return textResult(
          `Log counts by ${facet} (query: ${query}, range: ${from} → ${to}, total: ${total})\n${lines.join('\n')}`
        )
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

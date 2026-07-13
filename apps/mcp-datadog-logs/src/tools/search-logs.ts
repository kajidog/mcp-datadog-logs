import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../datadog/client.js'
import { extractTraceId, formatAttributeValue, lookupAttribute, normalizeLogRow } from '../datadog/normalize.js'
import { resolveRange } from '../datadog/time.js'
import { registerPrefixedTool } from './registration.js'
import { createErrorResponse, textResult } from './utils.js'

export function registerSearchLogsTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'search_logs',
    {
      title: 'Search Datadog Logs',
      description:
        'Search Datadog logs and return matching entries as compact text. ' +
        'Use for quick model-side inspection. For a visual, user-facing investigation use datadog_investigate_logs instead.',
      inputSchema: {
        query: z.string().default('*').describe('Datadog logs search query, e.g. "service:payments status:error"'),
        from: z
          .string()
          .default('now-15m')
          .describe('Start time: Datadog time math ("now-4h") or ISO 8601 with a time zone (Z or offset)'),
        to: z
          .string()
          .default('now')
          .describe('End time: Datadog time math ("now") or ISO 8601 with a time zone (Z or offset)'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max log entries to return'),
        sort: z.enum(['timestamp', '-timestamp']).default('-timestamp').describe('Sort order by timestamp'),
        cursor: z.string().optional().describe('Pagination cursor from a previous result'),
        attributes: z
          .array(z.string().min(1))
          .max(10)
          .optional()
          .describe(
            "Log attribute keys to append to each line as key=value, looked up by dot path in the log's custom " +
              'attributes (e.g. "http.status_code", "error.kind"). Missing keys are skipped.'
          ),
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
      limit,
      sort,
      cursor,
      attributes,
    }: {
      query: string
      from: string
      to: string
      limit: number
      sort: 'timestamp' | '-timestamp'
      cursor?: string
      attributes?: string[]
    }): Promise<CallToolResult> => {
      try {
        resolveRange(from, to)
        const client = getDatadogClient()
        const { logs, nextCursor } = await client.searchLogs({ query, from, to, limit, sort, cursor })
        if (logs.length === 0) {
          return textResult(`No logs matched query "${query}" between ${from} and ${to}.`)
        }
        const lines = logs.map((log) => {
          const row = normalizeLogRow(log, {
            maxRows: limit,
            maxMessageLength: 200,
            maxTags: 0,
            maxTimelineBuckets: 0,
            maxFacetValues: 0,
          })
          const bag = log.attributes?.attributes
          const traceId = extractTraceId(bag)
          const extras = (attributes ?? [])
            .map((key) => {
              const value = lookupAttribute(bag, key)
              return value === undefined || value === null ? undefined : `${key}=${formatAttributeValue(value)}`
            })
            .filter((part): part is string => part !== undefined)
          const parts = [
            row.timestamp,
            `[${row.status.toUpperCase()}]`,
            row.service ?? '-',
            row.host ? `host=${row.host}` : undefined,
            traceId ? `trace_id=${traceId}` : undefined,
            '—',
            row.message.replace(/\s+/g, ' ').trim() || '(no message)',
            extras.length > 0 ? `| ${extras.join(' ')}` : undefined,
          ]
          return parts.filter(Boolean).join(' ')
        })
        const header = `${logs.length} logs (query: ${query}, range: ${from} → ${to})`
        const footer = nextCursor ? `\nnextCursor: ${nextCursor}` : ''
        return textResult(`${header}\n${lines.join('\n')}${footer}`)
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

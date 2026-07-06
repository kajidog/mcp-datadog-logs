import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../datadog/client.js'
import { normalizeLogRow } from '../datadog/normalize.js'
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
        from: z.string().default('now-15m').describe('Start time: Datadog time math ("now-4h") or ISO 8601'),
        to: z.string().default('now').describe('End time: Datadog time math ("now") or ISO 8601'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max log entries to return'),
        sort: z.enum(['timestamp', '-timestamp']).default('-timestamp').describe('Sort order by timestamp'),
        cursor: z.string().optional().describe('Pagination cursor from a previous result'),
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
    }: {
      query: string
      from: string
      to: string
      limit: number
      sort: 'timestamp' | '-timestamp'
      cursor?: string
    }): Promise<CallToolResult> => {
      try {
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
          const parts = [
            row.timestamp,
            `[${row.status.toUpperCase()}]`,
            row.service ?? '-',
            row.host ? `host=${row.host}` : undefined,
            '—',
            row.message.replace(/\s+/g, ' ').trim() || '(no message)',
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

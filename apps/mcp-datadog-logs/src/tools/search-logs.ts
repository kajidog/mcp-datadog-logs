import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { extractLogPatterns } from '../analysis/patterns.js'
import { getDatadogClient } from '../datadog/client.js'
import { extractTraceId, formatAttributeValue, lookupAttribute, normalizeLogRow } from '../datadog/normalize.js'
import { resolveRange } from '../datadog/time.js'
import { registerPrefixedTool } from './registration.js'
import { createErrorResponse, stringListParam, textResult, toStringList } from './utils.js'

export function registerSearchLogsTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'search_logs',
    {
      title: 'Search Datadog Logs',
      description:
        'Search Datadog logs and return matching entries as compact text. ' +
        'Best for pinpoint lookups: a known query, a few rows, one attribute to check. ' +
        'For broad investigation (unknown error shape, need volume/timeline/breakdowns) use datadog_run_investigation ' +
        'instead — one call fetches rows+timeline+facets+patterns into a server-side session that ' +
        'datadog_get_session_logs can drill into without further Datadog calls. ' +
        'For a visual, user-facing investigation use datadog_investigate_logs.',
      inputSchema: {
        query: z
          .string()
          .default('*')
          .describe(
            'Datadog logs search query, e.g. "service:payments status:error". Note: free-text terms only match ' +
              'the log message, not custom attributes — to match inside an attribute use its @path, ' +
              'e.g. @error:*SomeException*.'
          ),
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
        attributes: stringListParam(10)
          .optional()
          .describe(
            "Log attribute keys to append to each line as key=value, looked up by dot path in the log's custom " +
              'attributes. JSON array, e.g. ["http.status_code", "error.kind"] (a comma-separated string also ' +
              'works). Missing keys are skipped. Values over 300 chars are middle-truncated; for full values run ' +
              'datadog_run_investigation and use datadog_get_session_logs detail mode.'
          ),
        dedupe: z
          .boolean()
          .default(false)
          .describe(
            'Cluster the fetched page into message patterns and return one line per pattern (count + template + ' +
              'example) instead of one line per log. Applies to the fetched page only (up to limit rows).'
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
      dedupe,
    }: {
      query: string
      from: string
      to: string
      limit: number
      sort: 'timestamp' | '-timestamp'
      cursor?: string
      attributes?: string[] | string
      dedupe: boolean
    }): Promise<CallToolResult> => {
      try {
        const attributeKeys = toStringList(attributes, 10)
        resolveRange(from, to)
        const client = getDatadogClient()
        const { logs, nextCursor } = await client.searchLogs({ query, from, to, limit, sort, cursor })
        if (logs.length === 0) {
          return textResult(`No logs matched query "${query}" between ${from} and ${to}.`)
        }
        const rows = logs.map((log) =>
          normalizeLogRow(log, {
            maxRows: limit,
            maxMessageLength: 200,
            maxTags: 0,
            maxTimelineBuckets: 0,
            maxFacetValues: 0,
          })
        )
        const footer = nextCursor ? `\nnextCursor: ${nextCursor}` : ''
        if (dedupe) {
          // Uncapped on purpose: the default 20-pattern cap would silently drop
          // the rarest templates and make the header underreport the total.
          // Each pattern needs at least one row, so the page size bounds this.
          const patterns = extractLogPatterns(rows, { maxPatterns: rows.length })
          const header = `${logs.length} logs in ${patterns.length} patterns (query: ${query}, range: ${from} → ${to})`
          const lines = patterns.map((pattern) => {
            const rowIndex = rows.findIndex((row) => row.id === pattern.rowIds[0])
            const example = rows[rowIndex]
            const exampleText = example
              ? `${example.timestamp} ${example.service ?? '-'}: ${example.message.replace(/\s+/g, ' ').trim()}`
              : pattern.example
            return `${pattern.count}x ${pattern.template.replace(/\s+/g, ' ').trim()} — e.g. ${exampleText}`
          })
          return textResult(`${header}\n${lines.join('\n')}${footer}`)
        }
        const lines = logs.map((log, i) => {
          const row = rows[i]
          const bag = log.attributes?.attributes
          const traceId = extractTraceId(bag)
          const extras = (attributeKeys ?? [])
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
        return textResult(`${header}\n${lines.join('\n')}${footer}`)
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

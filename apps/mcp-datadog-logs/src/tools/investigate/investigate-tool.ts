import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../../datadog/client.js'
import { runInvestigation } from '../../datadog/investigation.js'
import { registerPrefixedAppTool } from '../registration.js'
import { createErrorResponse } from '../utils.js'
import { investigatorResourceUri, setSession } from './runtime.js'

export function registerInvestigateTool(server: McpServer): void {
  registerPrefixedAppTool(
    server,
    'investigate_logs',
    {
      title: 'Investigate Datadog Logs',
      description:
        'Open an interactive Datadog log investigation UI (timeline chart, facet breakdowns, log table). ' +
        'The user can adjust the query/time range in the UI and export a shareable HTML report. ' +
        'Returns a viewUUID and a summary. For plain text results use datadog_search_logs.',
      inputSchema: {
        query: z.string().default('*').describe('Datadog logs search query, e.g. "service:payments status:error"'),
        from: z.string().default('now-1h').describe('Start time: Datadog time math ("now-4h") or ISO 8601'),
        to: z.string().default('now').describe('End time'),
        groupBy: z.string().optional().describe('Extra facet to break down by, e.g. "@http.status_code"'),
        title: z.string().optional().describe('Human-readable title for this investigation / report'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: investigatorResourceUri } },
    },
    async ({
      query,
      from,
      to,
      groupBy,
      title,
    }: {
      query: string
      from: string
      to: string
      groupBy?: string
      title?: string
    }): Promise<CallToolResult> => {
      try {
        const client = getDatadogClient()
        const { result, rawById } = await runInvestigation(client, { query, from, to, groupBy, title })
        const viewUUID = randomUUID()
        const now = Date.now()
        setSession(viewUUID, { result, rawById, title, createdAt: now, updatedAt: now })

        const statusFacet = result.facets.find((f) => f.facet === 'status')
        const count = (status: string) => statusFacet?.values.find((v) => v.value === status)?.count ?? 0
        const serviceFacet = result.facets.find((f) => f.facet === 'service')
        const topServices = (serviceFacet?.values ?? [])
          .slice(0, 3)
          .map((v) => `${v.value} (${v.count})`)
          .join(', ')

        // "viewUUID: <uuid>" is the contract with the investigator UI. Hosts
        // forward only content text (not structuredContent/_meta) to the app,
        // so the UI parses this text and pulls state via _get_view_state.
        return {
          content: [
            {
              type: 'text',
              text:
                `Datadog log investigation started. viewUUID: ${viewUUID}\n` +
                `Query: ${result.params.query} | Range: ${from} → ${to} | ~${result.totalCount} logs ` +
                `(${count('error')} error, ${count('warn')} warn)` +
                (topServices ? `\nTop services: ${topServices}` : '') +
                '\nThe user can refine the query and export an HTML report from the UI. ' +
                'For model-side drill-down use datadog_search_logs / datadog_aggregate_logs.',
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

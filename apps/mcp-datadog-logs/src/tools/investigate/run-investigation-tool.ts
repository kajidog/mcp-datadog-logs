import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { HARD_MAX_ROWS } from '../../config.js'
import { registerPrefixedTool } from '../registration.js'
import { createErrorResponse, textResult } from '../utils.js'
import { runAndStoreInvestigation, sessionResult } from './session-ops.js'
import { formatInvestigationSummary } from './summary.js'

export function registerRunInvestigationTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'run_investigation',
    {
      title: 'Run Datadog Log Investigation (no UI)',
      description:
        'Run a log investigation (log page + status timeline + facet breakdowns) WITHOUT opening a UI. ' +
        'The full result is stored server-side under a viewUUID; only a compact summary is returned. ' +
        'Pass the same viewUUID to iterate on one session (refine the query, or load more rows with cursor), ' +
        'then call datadog_investigate_logs with the viewUUID to display the session to the user. ' +
        'Sessions are cached in memory and mirrored to disk, so a viewUUID usually survives server restarts.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Datadog logs search query (default: "*"; inherited when continuing with viewUUID + cursor)'),
        from: z
          .string()
          .optional()
          .describe('Start time: Datadog time math or ISO 8601 (default: "now-1h"; inherited for cursor continuation)'),
        to: z.string().optional().describe('End time (default: "now"; inherited for cursor continuation)'),
        groupBy: z.string().optional().describe('Extra facet to break down by, e.g. "@http.status_code"'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(HARD_MAX_ROWS)
          .optional()
          .describe('Max log rows to fetch and store in the session (not returned to you)'),
        viewUUID: z
          .uuid()
          .optional()
          .describe('Existing investigation session to update/iterate on; omit to create a new one'),
        cursor: z
          .string()
          .optional()
          .describe('Pagination cursor from a previous summary — appends the next page of rows (requires viewUUID)'),
        sampleRows: z
          .number()
          .int()
          .min(0)
          .max(20)
          .default(3)
          .describe('How many sample log lines to include in the summary'),
        findings: z
          .string()
          .max(20_000)
          .optional()
          .describe(
            'Plain-text findings/notes to attach to the session; shown in the UI and HTML report. Replaces previous findings.'
          ),
        title: z.string().optional().describe('Human-readable title for this investigation / report'),
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
      limit,
      viewUUID,
      cursor,
      sampleRows,
      findings,
      title,
    }: {
      query?: string
      from?: string
      to?: string
      groupBy?: string
      limit?: number
      viewUUID?: string
      cursor?: string
      sampleRows: number
      findings?: string
      title?: string
    }): Promise<CallToolResult> => {
      try {
        if (cursor && !viewUUID) {
          return createErrorResponse(new Error('cursor requires viewUUID (load-more appends to an existing session)'))
        }
        const stored = await runAndStoreInvestigation({
          viewUUID,
          params: { query, from, to, groupBy, limit, cursor, title },
          findings,
        })
        const summary = formatInvestigationSummary(sessionResult(stored.session), stored.viewUUID, { sampleRows })
        return textResult(
          `${summary}\n` +
            'Call this tool again with the same viewUUID to refine or load more, ' +
            'or call datadog_investigate_logs with this viewUUID to display it to the user.'
        )
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

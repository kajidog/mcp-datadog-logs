import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { HARD_MAX_ROWS } from '../../config.js'
import { registerPrefixedAppTool } from '../registration.js'
import { createErrorResponse, jsonResult } from '../utils.js'
import { exportInvestigationReport } from './export-report.js'
import { getSession, investigatorResourceUri } from './runtime.js'
import { runAndStoreInvestigation, sessionResult } from './session-ops.js'

const appOnlyMeta = {
  ui: {
    resourceUri: investigatorResourceUri,
    visibility: ['app'],
  },
} as const

export function registerInvestigateAppTools(server: McpServer): void {
  registerPrefixedAppTool(
    server,
    '_get_view_state',
    {
      title: 'Get Investigation State (App)',
      description: 'Fetch the stored investigation result for a viewUUID. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().describe('Investigation view ID from the tool result text'),
      },
      _meta: appOnlyMeta,
    },
    async ({ viewUUID }: { viewUUID: string }): Promise<CallToolResult> => {
      const session = getSession(viewUUID)
      if (!session) {
        // State can be lost on server restart. Return notFound (not an error)
        // so the UI can show a "session expired" message.
        return jsonResult({ notFound: true })
      }
      return jsonResult(sessionResult(session))
    }
  )

  registerPrefixedAppTool(
    server,
    '_run_investigation',
    {
      title: 'Run Investigation (App)',
      description:
        'Re-run the investigation with adjusted parameters and update the stored view state. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().describe('Investigation view ID to update'),
        query: z.string().describe('Datadog logs search query'),
        from: z.string().describe('Start time (Datadog time math or ISO 8601)'),
        to: z.string().describe('End time'),
        groupBy: z.string().optional().describe('Extra facet to break down by'),
        limit: z.number().int().min(1).max(HARD_MAX_ROWS).optional().describe('Max log rows'),
        cursor: z.string().optional().describe('Pagination cursor — appends the next page of rows to the view'),
      },
      _meta: appOnlyMeta,
    },
    async ({
      viewUUID,
      query,
      from,
      to,
      groupBy,
      limit,
      cursor,
    }: {
      viewUUID: string
      query: string
      from: string
      to: string
      groupBy?: string
      limit?: number
      cursor?: string
    }): Promise<CallToolResult> => {
      try {
        // No findings arg: existing findings are preserved across UI re-runs.
        const { session } = await runAndStoreInvestigation({
          viewUUID,
          params: { query, from, to, groupBy, limit, cursor },
        })
        return jsonResult(sessionResult(session))
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerPrefixedAppTool(
    server,
    '_get_log_detail',
    {
      title: 'Get Log Detail (App)',
      description: 'Fetch the full raw log event for a row in the investigation table. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().describe('Investigation view ID'),
        logId: z.string().describe('Log row ID'),
      },
      _meta: appOnlyMeta,
    },
    async ({ viewUUID, logId }: { viewUUID: string; logId: string }): Promise<CallToolResult> => {
      const session = getSession(viewUUID)
      if (!session) {
        return jsonResult({ notFound: true })
      }
      const raw = session.rawById.get(logId)
      if (!raw) {
        return jsonResult({ notFound: true })
      }
      return jsonResult(raw)
    }
  )

  registerPrefixedAppTool(
    server,
    '_export_report',
    {
      title: 'Export Investigation Report (App)',
      description:
        'Generate a self-contained HTML report for the investigation and write it to the export directory. Only callable from the app UI.',
      inputSchema: {
        viewUUID: z.string().describe('Investigation view ID'),
        title: z.string().optional().describe('Report title override'),
      },
      _meta: appOnlyMeta,
    },
    async ({ viewUUID, title }: { viewUUID: string; title?: string }): Promise<CallToolResult> => {
      try {
        return jsonResult(await exportInvestigationReport({ viewUUID, title }))
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

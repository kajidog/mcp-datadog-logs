import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerPrefixedTool } from '../registration.js'
import { createErrorResponse, textResult } from '../utils.js'
import { exportInvestigationReport } from './export-report.js'

export function registerExportReportTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'export_report',
    {
      title: 'Export Investigation Report (no UI)',
      description:
        'Export an investigation session to the export directory, WITHOUT opening a UI. ' +
        'Pass the viewUUID returned by datadog_run_investigation or datadog_investigate_logs. ' +
        'format "html" (default) writes a self-contained report with the timeline chart, facet breakdowns, ' +
        'message patterns, log entries and any findings, and opens it in the default browser when possible. ' +
        'format "csv" or "json" writes the fetched log rows as data instead (not opened automatically) — ' +
        'share the saved path with the user.',
      inputSchema: {
        viewUUID: z.uuid().describe('Investigation view ID from a previous investigation tool result'),
        title: z.string().optional().describe('Report title override'),
        format: z
          .enum(['html', 'csv', 'json'])
          .optional()
          .describe('Output format: "html" report (default), or "csv"/"json" of the fetched log rows'),
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
      },
    },
    async ({
      viewUUID,
      title,
      format,
    }: {
      viewUUID: string
      title?: string
      format?: 'html' | 'csv' | 'json'
    }): Promise<CallToolResult> => {
      try {
        const result = await exportInvestigationReport({ viewUUID, title, format })
        if (!result.ok) {
          return createErrorResponse(new Error(result.error))
        }
        const openedNote =
          (format ?? 'html') !== 'html'
            ? 'Share the file path with the user.'
            : result.opened
              ? 'Opened in the default browser.'
              : `Could not open a browser${result.openError ? ` (${result.openError})` : ''} — share the file path with the user.`
        return textResult(`Report saved to ${result.path}\n${openedNote}`)
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

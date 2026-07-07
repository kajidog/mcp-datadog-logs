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
      title: 'Export Investigation Report as HTML (no UI)',
      description:
        'Generate a self-contained HTML report for an investigation session and write it to the export directory, ' +
        'WITHOUT opening a UI. Pass the viewUUID returned by datadog_run_investigation or datadog_investigate_logs. ' +
        'The report includes the timeline chart, facet breakdowns, log entries and any findings attached to the session. ' +
        'The file is opened in the default browser when possible; otherwise share the saved path with the user.',
      inputSchema: {
        viewUUID: z.uuid().describe('Investigation view ID from a previous investigation tool result'),
        title: z.string().optional().describe('Report title override'),
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
      },
    },
    async ({ viewUUID, title }: { viewUUID: string; title?: string }): Promise<CallToolResult> => {
      try {
        const result = await exportInvestigationReport({ viewUUID, title })
        if (!result.ok) {
          return createErrorResponse(new Error(result.error))
        }
        const openedNote = result.opened
          ? 'Opened in the default browser.'
          : `Could not open a browser${result.openError ? ` (${result.openError})` : ''} — share the file path with the user.`
        return textResult(`Report saved to ${result.path}\n${openedNote}`)
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

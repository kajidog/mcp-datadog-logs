import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getServerConfig, HARD_MAX_ROWS } from '../../config.js'
import { getDatadogClient } from '../../datadog/client.js'
import { generateReport } from '../../report/generate.js'
import { registerPrefixedAppTool } from '../registration.js'
import { createErrorResponse, jsonResult } from '../utils.js'
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
        const session = getSession(viewUUID)
        if (!session) {
          return jsonResult({ ok: false, error: 'Investigation session not found. Re-run the investigation first.' })
        }
        const html = generateReport(sessionResult(session), session.rawById, {
          title: title ?? session.title,
          site: safeSite(),
        })
        const { exportDir } = getServerConfig()
        mkdirSync(exportDir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
        const path = join(exportDir, `datadog-logs-report-${stamp}.html`)
        writeFileSync(path, html, 'utf-8')
        const openResult = await openExportedReport(path)
        return jsonResult({ ok: true, path, ...openResult })
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

interface BrowserOpenCommand {
  command: string
  args: string[]
}

interface BrowserOpenResult {
  opened: boolean
  openError?: string
}

const OPEN_REPORT_TIMEOUT_MS = 2000

function openCommandForPlatform(url: string): BrowserOpenCommand {
  if (process.platform === 'darwin') {
    return { command: 'open', args: [url] }
  }
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/c', 'start', '', url] }
  }
  return { command: 'xdg-open', args: [url] }
}

function openExportedReport(path: string): Promise<BrowserOpenResult> {
  const { command, args } = openCommandForPlatform(pathToFileURL(path).href)

  return new Promise((resolve) => {
    let settled = false
    let child: ReturnType<typeof spawn> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    const settle = (result: BrowserOpenResult) => {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      resolve(result)
    }

    timeout = setTimeout(() => {
      child?.unref()
      settle({ opened: true })
    }, OPEN_REPORT_TIMEOUT_MS)
    timeout.unref()

    try {
      child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    } catch (error) {
      settle({
        opened: false,
        openError: error instanceof Error ? error.message : String(error),
      })
      return
    }

    child.once('error', (error) => {
      settle({ opened: false, openError: `${command}: ${error.message}` })
    })
    child.once('close', (code, signal) => {
      child?.unref()
      if (code === 0) {
        settle({ opened: true })
        return
      }
      const reason = signal ? `terminated by ${signal}` : `exited with code ${code ?? 'unknown'}`
      settle({ opened: false, openError: `${command} ${reason}` })
    })
  })
}

function safeSite(): string | undefined {
  try {
    return getDatadogClient().site
  } catch {
    return undefined
  }
}

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getServerConfig } from '../../config.js'
import { getDatadogClient } from '../../datadog/client.js'
import { investigationToCsv, investigationToJson } from '../../report/export-data.js'
import { generateReport } from '../../report/generate.js'
import { getSession } from './runtime.js'
import { sessionResult } from './session-ops.js'

export type ExportFormat = 'html' | 'csv' | 'json'

export interface ExportReportOptions {
  viewUUID: string
  title?: string
  format?: ExportFormat
  /** csv/json only: export just these stored rows (e.g. the UI's filtered view) */
  rowIds?: string[]
}

export type ExportReportResult =
  | { ok: true; path: string; opened: boolean; openError?: string }
  | { ok: false; error: string }

/**
 * Exports a stored investigation session to the export directory as a
 * self-contained HTML report (default), or as CSV/JSON of the fetched log
 * rows. HTML is opened in the default browser; data formats are not (the OS
 * handler for .csv/.json is unpredictable). Shared by the app-only
 * `_export_report` tool and the model-facing `datadog_export_report` tool.
 */
export async function exportInvestigationReport({
  viewUUID,
  title,
  format = 'html',
  rowIds,
}: ExportReportOptions): Promise<ExportReportResult> {
  const session = getSession(viewUUID)
  if (!session) {
    return { ok: false, error: 'Investigation session not found. Re-run the investigation first.' }
  }
  const { exportDir, timeZone } = getServerConfig()
  const result = sessionResult(session)
  const exportTitle = title ?? session.title
  let content: string
  if (format === 'html') {
    content = generateReport(result, session.rawById, { title: exportTitle, site: safeSite(), timeZone })
  } else {
    const idSet = rowIds ? new Set(rowIds) : undefined
    const rows = idSet ? result.rows.filter((row) => idSet.has(row.id)) : result.rows
    content =
      format === 'csv'
        ? investigationToCsv(result, { rows })
        : investigationToJson(result, { title: exportTitle, rows })
  }
  mkdirSync(exportDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const path = join(exportDir, `datadog-logs-report-${stamp}.${format}`)
  writeFileSync(path, content, 'utf-8')
  if (format !== 'html') {
    return { ok: true, path, opened: false }
  }
  const openResult = await openExportedReport(path)
  return { ok: true, path, ...openResult }
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

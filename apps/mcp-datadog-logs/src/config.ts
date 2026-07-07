import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface DatadogConfig {
  apiKey: string
  appKey: string
  site: string
  indexes?: string[]
}

export interface ServerConfig {
  exportDir: string
  maxRows: number
  /** IANA time zone used for timestamps in exported HTML reports */
  timeZone: string
}

export const HARD_MAX_ROWS = 500

/**
 * Reads Datadog credentials from the environment. Called lazily from tool
 * handlers (not at startup) so the MCP server can start without credentials
 * and surface an actionable error only when a tool is actually invoked.
 */
export function getDatadogConfig(env: NodeJS.ProcessEnv = process.env): DatadogConfig {
  const apiKey = env.DD_API_KEY?.trim()
  const appKey = env.DD_APP_KEY?.trim()
  if (!apiKey || !appKey) {
    throw new Error(
      'Datadog credentials are not configured. Set DD_API_KEY and DD_APP_KEY environment variables ' +
        '(and optionally DD_SITE, e.g. "datadoghq.com", "ap1.datadoghq.com", "datadoghq.eu").'
    )
  }
  const indexes = env.DD_LOGS_INDEXES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    apiKey,
    appKey,
    site: env.DD_SITE?.trim() || 'datadoghq.com',
    indexes: indexes && indexes.length > 0 ? indexes : undefined,
  }
}

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = Number.parseInt(env.MCP_DATADOG_MAX_ROWS ?? '', 10)
  const maxRows = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, HARD_MAX_ROWS) : 200
  return {
    exportDir: resolveExportDir(env),
    maxRows,
    timeZone: resolveTimeZone(env),
  }
}

function resolveTimeZone(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.MCP_DATADOG_TIMEZONE?.trim()
  if (!fromEnv) {
    return 'UTC'
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fromEnv })
    return fromEnv
  } catch {
    // stdout is the MCP channel — warnings go to stderr.
    console.error(`mcp-datadog-logs: invalid MCP_DATADOG_TIMEZONE "${fromEnv}", falling back to UTC`)
    return 'UTC'
  }
}

function resolveExportDir(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.MCP_DATADOG_EXPORT_DIR?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const downloads = join(homedir(), 'Downloads')
  if (existsSync(downloads)) {
    return downloads
  }
  return process.cwd()
}

import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InvestigationResult } from '@kajidog/investigation-shared'
import { getServerConfig } from '../../config.js'
import type { RawLog } from '../../datadog/normalize.js'
import type { InvestigationSession } from './runtime.js'

/**
 * Best-effort on-disk copy of the in-memory session store so investigations
 * survive server restarts. Every failure here is swallowed (logged to stderr —
 * stdout is the MCP channel): persistence must never break a tool call.
 */

interface PersistedSessionFile {
  /** Bump on breaking schema changes; mismatched files are silently ignored */
  version: 1
  viewUUID: string
  title?: string
  findings?: string
  createdAt: number
  updatedAt: number
  result: InvestigationResult
  /** rawById flattened for JSON; ids are rebuilt from RawLog.id on load */
  rawLogs: RawLog[]
}

const SCHEMA_VERSION = 1
/** Matches the in-memory MAX_SESSIONS in runtime.ts. */
const MAX_PERSISTED_SESSIONS = 50
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Sessions serializing beyond this are retried without raw logs, then skipped. */
const MAX_SESSION_FILE_BYTES = 15 * 1024 * 1024

const FILE_PATTERN = /^[0-9a-fA-F-]{36}\.json$/

export function persistSession(viewUUID: string, session: InvestigationSession): void {
  const { sessionDir, persistSessions } = getServerConfig()
  if (!persistSessions) {
    return
  }
  try {
    const file: PersistedSessionFile = {
      version: SCHEMA_VERSION,
      viewUUID,
      title: session.title,
      findings: session.findings,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      result: session.result,
      rawLogs: [...session.rawById.values()],
    }
    let json = JSON.stringify(file)
    if (json.length > MAX_SESSION_FILE_BYTES) {
      json = JSON.stringify({ ...file, rawLogs: [] })
      if (json.length > MAX_SESSION_FILE_BYTES) {
        return
      }
    }
    mkdirSync(sessionDir, { recursive: true })
    const path = join(sessionDir, `${viewUUID}.json`)
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, json, 'utf-8')
    renameSync(tmpPath, path)
    pruneSessions(sessionDir)
  } catch (error) {
    warn('failed to persist session', error)
  }
}

export function loadSession(viewUUID: string): InvestigationSession | undefined {
  const { sessionDir, persistSessions } = getServerConfig()
  if (!persistSessions || !FILE_PATTERN.test(`${viewUUID}.json`)) {
    return undefined
  }
  try {
    const json = readFileSync(join(sessionDir, `${viewUUID}.json`), 'utf-8')
    const file = JSON.parse(json) as Partial<PersistedSessionFile>
    if (file.version !== SCHEMA_VERSION || file.viewUUID !== viewUUID || !file.result) {
      return undefined
    }
    const rawById = new Map<string, RawLog>()
    for (const raw of file.rawLogs ?? []) {
      if (raw.id) {
        rawById.set(raw.id, raw)
      }
    }
    return {
      result: file.result,
      rawById,
      title: file.title,
      findings: file.findings,
      createdAt: file.createdAt ?? Date.now(),
      updatedAt: file.updatedAt ?? Date.now(),
    }
  } catch {
    // Missing, unreadable or corrupt file — same as an expired session.
    return undefined
  }
}

/** Drops persisted sessions beyond MAX_PERSISTED_SESSIONS or older than the TTL. */
function pruneSessions(sessionDir: string): void {
  const now = Date.now()
  const files = readdirSync(sessionDir)
    .filter((name) => FILE_PATTERN.test(name))
    .flatMap((name) => {
      const path = join(sessionDir, name)
      try {
        return [{ path, mtimeMs: statSync(path).mtimeMs }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  files.forEach(({ path, mtimeMs }, index) => {
    if (index < MAX_PERSISTED_SESSIONS && now - mtimeMs <= SESSION_TTL_MS) {
      return
    }
    try {
      unlinkSync(path)
    } catch {
      // Already gone or locked — retried on the next write.
    }
  })
}

function warn(message: string, error: unknown): void {
  console.error(`mcp-datadog-logs: ${message}: ${error instanceof Error ? error.message : String(error)}`)
}

import type { InvestigationResult } from '@kajidog/investigation-shared'
import type { RawLog } from '../../datadog/normalize.js'
import { loadSession, persistSession } from './persistence.js'

export const investigatorResourceUri = 'ui://datadog-logs/investigator.html'

export interface InvestigationSession {
  result: InvestigationResult
  rawById: Map<string, RawLog>
  title?: string
  /** AI-authored findings/notes (plain text), shown in the UI and HTML report */
  findings?: string
  createdAt: number
  updatedAt: number
}

const MAX_SESSIONS = 50

/**
 * Module-scope session store keyed by viewUUID. Oldest sessions are evicted
 * beyond MAX_SESSIONS to bound memory in long-lived stdio processes. Each
 * session is also mirrored to disk (best-effort) so a viewUUID survives
 * restarts and LRU eviction.
 */
const sessions = new Map<string, InvestigationSession>()

export function setSession(viewUUID: string, session: InvestigationSession): void {
  sessions.delete(viewUUID)
  sessions.set(viewUUID, session)
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value
    if (oldest === undefined) {
      break
    }
    sessions.delete(oldest)
  }
  persistSession(viewUUID, session)
}

export function getSession(viewUUID: string): InvestigationSession | undefined {
  const session = sessions.get(viewUUID)
  if (session) {
    // LRU touch: keep actively used sessions from being evicted.
    sessions.delete(viewUUID)
    sessions.set(viewUUID, session)
    return session
  }
  const restored = loadSession(viewUUID)
  if (restored) {
    setSession(viewUUID, restored)
  }
  return restored
}

/** Test hook: clears the in-memory store only (persisted files are untouched). */
export function clearSessions(): void {
  sessions.clear()
}

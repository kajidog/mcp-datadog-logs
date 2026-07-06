import type { InvestigationResult } from '@kajidog/investigation-shared'
import type { RawLog } from '../../datadog/normalize.js'

export const investigatorResourceUri = 'ui://datadog-logs/investigator.html'

export interface InvestigationSession {
  result: InvestigationResult
  rawById: Map<string, RawLog>
  title?: string
  createdAt: number
  updatedAt: number
}

const MAX_SESSIONS = 50

/**
 * Module-scope session store keyed by viewUUID. Oldest sessions are evicted
 * beyond MAX_SESSIONS to bound memory in long-lived stdio processes.
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
}

export function getSession(viewUUID: string): InvestigationSession | undefined {
  return sessions.get(viewUUID)
}

/** Test hook. */
export function clearSessions(): void {
  sessions.clear()
}

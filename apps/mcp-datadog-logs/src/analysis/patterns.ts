import type { LogPattern, LogRow } from '@kajidog/investigation-shared'

export interface ExtractPatternsOptions {
  /** Max patterns returned, most frequent first */
  maxPatterns?: number
}

const DEFAULT_MAX_PATTERNS = 20

/**
 * Clusters log messages into patterns by replacing variable tokens (ids,
 * timestamps, numbers, quoted strings, …) with "<*>" and grouping rows that
 * share the resulting template. Local and dependency-free: it only sees the
 * rows already fetched into the session, not the full Datadog match set.
 */
export function extractLogPatterns(rows: LogRow[], opts: ExtractPatternsOptions = {}): LogPattern[] {
  const maxPatterns = opts.maxPatterns ?? DEFAULT_MAX_PATTERNS
  const groups = new Map<string, { count: number; example: string; rowIds: string[] }>()
  let analyzed = 0

  for (const row of rows) {
    const message = row.message.trim()
    if (!message) {
      continue
    }
    analyzed += 1
    const template = normalizeMessage(message)
    const group = groups.get(template)
    if (group) {
      group.count += 1
      group.rowIds.push(row.id)
    } else {
      groups.set(template, { count: 1, example: message, rowIds: [row.id] })
    }
  }

  if (analyzed === 0) {
    return []
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, maxPatterns)
    .map(([template, group]) => ({
      template,
      count: group.count,
      ratio: group.count / analyzed,
      example: group.example,
      rowIds: group.rowIds,
    }))
}

const WILDCARD = '<*>'

// Ordered most-specific first: each rule replaces a whole class of variable
// tokens before a broader rule (e.g. bare numbers) could split it apart.
const TOKEN_RULES: RegExp[] = [
  // UUIDs
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
  // ISO 8601 timestamps (with optional time part)
  /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g,
  // IPv4 addresses (optionally with port)
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g,
  // Long hex strings (hashes, trace ids), optionally 0x-prefixed
  /\b(?:0x)?[0-9a-fA-F]{8,}\b/g,
  // Quoted strings
  /"[^"]*"|'[^']*'/g,
]

/** Whole tokens that contain a digit (numbers, `123ms`, `#42`, `user=7`, paths with ids). */
const NUMERIC_TOKEN = /^\S*\d\S*$/

function normalizeMessage(message: string): string {
  let text = message
  for (const rule of TOKEN_RULES) {
    text = text.replace(rule, WILDCARD)
  }
  const tokens = text.split(/\s+/).map((token) => {
    if (token.includes(WILDCARD)) {
      return WILDCARD
    }
    return NUMERIC_TOKEN.test(token) ? WILDCARD : token
  })
  // Collapse runs of wildcards so variable-length segments group together.
  const collapsed: string[] = []
  for (const token of tokens) {
    if (token === WILDCARD && collapsed[collapsed.length - 1] === WILDCARD) {
      continue
    }
    collapsed.push(token)
  }
  return collapsed.join(' ')
}

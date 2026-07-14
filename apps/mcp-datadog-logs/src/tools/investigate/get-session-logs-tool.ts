import type { LogRow } from '@kajidog/investigation-shared'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { formatAttributeValue, lookupAttribute, type RawLog } from '../../datadog/normalize.js'
import { registerPrefixedTool } from '../registration.js'
import { textResult } from '../utils.js'
import { getSession, type InvestigationSession } from './runtime.js'
import { formatSampleLine } from './summary.js'

/** Full-JSON detail beyond this size falls back to a field overview + fields hint. */
const MAX_DETAIL_CHARS = 8000
const MAX_FIELD_VALUE_LENGTH = 2000
const MAX_OVERVIEW_VALUE_LENGTH = 120

function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

export function registerGetSessionLogsTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'get_session_logs',
    {
      title: 'Read Stored Investigation Logs',
      description:
        'Read log rows already stored in a datadog_run_investigation session — no Datadog API call, no rate cost. ' +
        'List mode (default): compact one-line-per-log output filtered by status/service/pattern/contains with ' +
        'offset/limit paging. Detail mode: pass logId or row to get one full raw log as JSON (use fields to select ' +
        'attribute paths on large logs). Pattern numbers (#1…) and row indexes ([N]) come from the ' +
        'datadog_run_investigation summary and from list output; row indexes stay valid across cursor load-more ' +
        'but reset when the session query is re-run.',
      inputSchema: {
        viewUUID: z.uuid().describe('Investigation session ID from datadog_run_investigation'),
        logId: z.string().optional().describe('Detail mode: full log ID — returns the complete raw log as JSON'),
        row: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Detail mode: stored row index (the [N] prefix in list output) — alternative to logId'),
        fields: z
          .array(z.string().min(1))
          .max(20)
          .optional()
          .describe('Detail mode: attribute dot-paths to return instead of the full JSON (for large logs)'),
        status: z.array(z.string()).optional().describe('List filter: only these statuses, e.g. ["error","warn"]'),
        service: z.string().optional().describe('List filter: exact service name'),
        pattern: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('List filter: rows matching pattern #N from the summary (1-based)'),
        contains: z.string().optional().describe('List filter: case-insensitive substring of the message'),
        offset: z.number().int().min(0).default(0).describe('List mode: rows to skip (for paging)'),
        limit: z.number().int().min(1).max(100).default(20).describe('List mode: max rows to return'),
        attributes: z
          .array(z.string().min(1))
          .max(10)
          .optional()
          .describe(
            'List mode: attribute dot-paths appended per line as key=value, looked up in the stored raw log ' +
              '(e.g. "http.status_code", "error.kind"). Missing keys are skipped.'
          ),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({
      viewUUID,
      logId,
      row,
      fields,
      status,
      service,
      pattern,
      contains,
      offset,
      limit,
      attributes,
    }: {
      viewUUID: string
      logId?: string
      row?: number
      fields?: string[]
      status?: string[]
      service?: string
      pattern?: number
      contains?: string
      offset: number
      limit: number
      attributes?: string[]
    }): Promise<CallToolResult> => {
      const session = getSession(viewUUID)
      if (!session) {
        return errorResult(
          `Investigation session ${viewUUID} was not found (expired or server restarted). ` +
            'Re-run datadog_run_investigation to create a new session.'
        )
      }
      if (logId !== undefined || row !== undefined) {
        return formatLogDetail(session, { logId, row, fields })
      }
      return formatLogList(session, {
        status,
        service,
        pattern,
        contains,
        offset: offset ?? 0,
        limit: limit ?? 20,
        attributes,
      })
    }
  )
}

function formatLogDetail(
  session: InvestigationSession,
  opts: { logId?: string; row?: number; fields?: string[] }
): CallToolResult {
  const rows = session.result.rows
  let index: number
  if (opts.logId !== undefined) {
    index = rows.findIndex((r) => r.id === opts.logId)
    if (index === -1) {
      return errorResult(`Log ${opts.logId} is not in this session (${rows.length} stored rows).`)
    }
  } else {
    index = opts.row as number
    if (index >= rows.length) {
      return errorResult(`row=${index} is out of range: this session stores rows [0..${rows.length - 1}].`)
    }
  }
  const logRow = rows[index]
  const raw = session.rawById.get(logRow.id)
  if (!raw) {
    return errorResult(`Raw log for row ${index} (id ${logRow.id}) is no longer stored in this session.`)
  }
  const header = `${formatSampleLine(logRow, index)}\nlogId: ${logRow.id}`

  if (opts.fields && opts.fields.length > 0) {
    const bag = raw.attributes?.attributes
    const lines = opts.fields.map((path) => {
      const value = lookupAttribute(bag, path)
      return value === undefined || value === null
        ? `${path}: (not set)`
        : `${path}: ${formatAttributeValue(value, MAX_FIELD_VALUE_LENGTH)}`
    })
    return textResult(`${header}\n${lines.join('\n')}`)
  }

  const json = JSON.stringify(raw, null, 2)
  if (json.length <= MAX_DETAIL_CHARS) {
    return textResult(`${header}\n${json}`)
  }
  return textResult(`${header}\n${formatLargeLogOverview(raw, json.length)}`)
}

/**
 * Bounded overview for raw logs whose full JSON would blow up the context:
 * the message plus one truncated line per top-level attribute key, and a hint
 * to pull specific paths via `fields`.
 */
function formatLargeLogOverview(raw: RawLog, jsonLength: number): string {
  const lines: string[] = []
  const message = raw.attributes?.message ?? ''
  lines.push(`message: ${formatAttributeValue(message, MAX_FIELD_VALUE_LENGTH)}`)
  const bag = raw.attributes?.attributes ?? {}
  const keys = Object.keys(bag)
  if (keys.length > 0) {
    lines.push('attributes:')
    for (const key of keys) {
      lines.push(`  ${key}: ${formatAttributeValue(bag[key], MAX_OVERVIEW_VALUE_LENGTH)}`)
    }
  }
  lines.push(
    `Log is large (${Math.round(jsonLength / 1024)} KB) — values above are truncated. ` +
      'Pass fields=["error.stack", …] to fetch full values for specific attribute paths.'
  )
  return lines.join('\n')
}

interface ListOptions {
  status?: string[]
  service?: string
  pattern?: number
  contains?: string
  offset: number
  limit: number
  attributes?: string[]
}

function formatLogList(session: InvestigationSession, opts: ListOptions): CallToolResult {
  const rows = session.result.rows
  const filters: string[] = []
  let patternRowIds: Set<string> | undefined
  if (opts.pattern !== undefined) {
    const patterns = session.result.patterns ?? []
    if (opts.pattern > patterns.length) {
      return errorResult(`pattern=#${opts.pattern} is out of range: this session has ${patterns.length} patterns.`)
    }
    patternRowIds = new Set(patterns[opts.pattern - 1].rowIds)
    filters.push(`pattern=#${opts.pattern}`)
  }
  const statuses = opts.status && opts.status.length > 0 ? opts.status.map((s) => s.toLowerCase()) : undefined
  if (statuses) {
    filters.push(`status=${statuses.join(',')}`)
  }
  if (opts.service !== undefined) {
    filters.push(`service=${opts.service}`)
  }
  const needle = opts.contains?.toLowerCase()
  if (needle !== undefined) {
    filters.push(`contains="${opts.contains}"`)
  }

  const matches: Array<{ row: LogRow; index: number }> = []
  rows.forEach((row, index) => {
    if (statuses && !statuses.includes(row.status)) {
      return
    }
    if (opts.service !== undefined && row.service !== opts.service) {
      return
    }
    if (patternRowIds && !patternRowIds.has(row.id)) {
      return
    }
    if (needle !== undefined && !row.message.toLowerCase().includes(needle)) {
      return
    }
    matches.push({ row, index })
  })

  const filterNote = filters.length > 0 ? ` (${filters.join(', ')})` : ''
  const shown = matches.slice(opts.offset, opts.offset + opts.limit)
  const header =
    `${matches.length} of ${rows.length} stored rows match${filterNote}` +
    (matches.length > 0 ? ` — showing ${shown.length} (offset ${opts.offset})` : '')
  if (shown.length === 0) {
    return textResult(header)
  }

  const lines = shown.map(({ row, index }) => {
    const base = formatSampleLine(row, index)
    const extras = formatExtras(session.rawById.get(row.id), opts.attributes)
    return extras ? `${base} | ${extras}` : base
  })
  const footerParts: string[] = []
  if (opts.offset + shown.length < matches.length) {
    footerParts.push(`Next: offset=${opts.offset + shown.length}.`)
  }
  footerParts.push('Full log: pass row=<N> (or logId).')
  return textResult(`${header}\n${lines.join('\n')}\n${footerParts.join(' ')}`)
}

function formatExtras(raw: RawLog | undefined, attributes: string[] | undefined): string | undefined {
  if (!raw || !attributes || attributes.length === 0) {
    return undefined
  }
  const bag = raw.attributes?.attributes
  const parts = attributes
    .map((key) => {
      const value = lookupAttribute(bag, key)
      return value === undefined || value === null ? undefined : `${key}=${formatAttributeValue(value)}`
    })
    .filter((part): part is string => part !== undefined)
  return parts.length > 0 ? parts.join(' ') : undefined
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../datadog/client.js'
import type { RawSpan } from '../datadog/normalize.js'
import { toIso } from '../datadog/normalize.js'
import { resolveRange } from '../datadog/time.js'
import { registerPrefixedTool } from './registration.js'
import { createErrorResponse, textResult } from './utils.js'

const RENDER_CAP = 300
const MAX_RESOURCE_LENGTH = 100
const MAX_DEPTH = 10

function toEpoch(value: Date | string | undefined): number | undefined {
  if (value === undefined) {
    return undefined
  }
  const ms = (value instanceof Date ? value : new Date(value)).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) {
    return '?'
  }
  if (ms < 1) {
    return '<1ms'
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  return `${(ms / 60_000).toFixed(1)}m`
}

/**
 * Best-effort error detection: the Spans API has no first-class error flag,
 * so sniff the conventional keys in the span's attribute bags.
 */
function isErrorSpan(attrs: RawSpan['attributes']): boolean {
  for (const bag of [attrs?.custom, attrs?.attributes]) {
    if (!bag) {
      continue
    }
    const flag = bag.error
    if (flag === 1 || flag === '1' || flag === true || flag === 'true') {
      return true
    }
    if (typeof flag === 'object' && flag !== null) {
      return true
    }
    if ('error.message' in bag || 'error.type' in bag || 'error.stack' in bag) {
      return true
    }
  }
  return false
}

function spanKey(span: RawSpan): string | undefined {
  return span.attributes?.spanId ?? span.id
}

function spanStart(span: RawSpan): number | undefined {
  return toEpoch(span.attributes?.startTimestamp)
}

function byStartTime(a: RawSpan, b: RawSpan): number {
  return (spanStart(a) ?? Number.MAX_SAFE_INTEGER) - (spanStart(b) ?? Number.MAX_SAFE_INTEGER)
}

/** Renders the spans of one trace as a chronological parent/child tree. */
export function formatTrace(traceId: string, spans: RawSpan[], fetchTruncated: boolean): string {
  const byKey = new Map<string, RawSpan>()
  for (const span of spans) {
    const key = spanKey(span)
    if (key && !byKey.has(key)) {
      byKey.set(key, span)
    }
  }

  const roots: RawSpan[] = []
  const childrenByParent = new Map<string, RawSpan[]>()
  const orphanParent = new Map<RawSpan, string>()
  for (const span of spans) {
    const parentId = span.attributes?.parentId
    if (!parentId || parentId === '0' || parentId === spanKey(span)) {
      roots.push(span)
    } else if (byKey.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(span)
      childrenByParent.set(parentId, siblings)
    } else {
      orphanParent.set(span, parentId)
      roots.push(span)
    }
  }
  roots.sort(byStartTime)
  for (const children of childrenByParent.values()) {
    children.sort(byStartTime)
  }

  const starts = spans.map(spanStart).filter((ms): ms is number => ms !== undefined)
  const ends = spans
    .map((span) => toEpoch(span.attributes?.endTimestamp))
    .filter((ms): ms is number => ms !== undefined)
  const traceStart = starts.length > 0 ? Math.min(...starts) : undefined
  const traceDuration = traceStart !== undefined && ends.length > 0 ? Math.max(...ends) - traceStart : undefined

  const lines: string[] = []
  let rendered = 0
  const visited = new Set<RawSpan>()
  const visit = (span: RawSpan, depth: number): void => {
    if (visited.has(span)) {
      return
    }
    visited.add(span)
    if (rendered < RENDER_CAP) {
      lines.push(renderSpanLine(span, depth, traceStart, orphanParent.get(span)))
    }
    rendered++
    const key = spanKey(span)
    const children = key ? (childrenByParent.get(key) ?? []) : []
    for (const child of children) {
      visit(child, depth + 1)
    }
  }
  for (const root of roots) {
    visit(root, 0)
  }
  // Cycles among non-root spans (e.g. A→B→A with no root path) never get visited; surface them as leftovers.
  for (const span of spans) {
    visit(span, 0)
  }

  const errorCount = spans.filter((span) => isErrorSpan(span.attributes)).length
  const earliest = spans.filter((span) => spanStart(span) !== undefined).sort(byStartTime)[0]
  const header = [
    `Trace ${traceId} — ${spans.length} spans${errorCount > 0 ? ` (${errorCount} errors)` : ''}`,
    `duration ${formatDuration(traceDuration)}`,
    earliest ? `start ${toIso(earliest.attributes?.startTimestamp)}` : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  const truncatedNote = fetchTruncated
    ? '\n(fetch capped: showing the first spans by start time; the tree may be incomplete)'
    : ''
  const overflowNote = rendered > RENDER_CAP ? `\n(+${rendered - RENDER_CAP} more spans not shown)` : ''
  return `${header}${truncatedNote}\n${lines.join('\n')}${overflowNote}`
}

function renderSpanLine(span: RawSpan, depth: number, traceStart: number | undefined, missingParent?: string): string {
  const attrs = span.attributes
  const indent = '  '.repeat(Math.min(depth, MAX_DEPTH))
  const resource = (attrs?.resourceName ?? '').trim() || '(no resource)'
  const truncatedResource =
    resource.length > MAX_RESOURCE_LENGTH ? `${resource.slice(0, MAX_RESOURCE_LENGTH)}…` : resource
  const start = spanStart(span)
  const offset = traceStart !== undefined && start !== undefined ? start - traceStart : undefined
  const end = toEpoch(attrs?.endTimestamp)
  const duration = start !== undefined && end !== undefined ? end - start : undefined
  const parts = [
    `${indent}${attrs?.service ?? '-'}`,
    truncatedResource,
    `[${attrs?.type ?? 'custom'}]`,
    `+${formatDuration(offset)}`,
    formatDuration(duration),
    isErrorSpan(attrs) ? '[ERROR]' : undefined,
    missingParent ? `(parent ${missingParent} not fetched)` : undefined,
  ]
  return parts.filter(Boolean).join(' ')
}

export function registerGetTraceTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'get_trace',
    {
      title: 'Get Datadog APM Trace',
      description:
        'Fetch all APM spans of one trace by trace_id and render them as a chronological parent/child tree with ' +
        "service, resource, span type, start offset, duration, and error markers. Use it to pivot from a log line's " +
        'trace_id=... field (shown in datadog_search_logs output) into the distributed trace behind it. ' +
        "Set from/to so the range brackets the log's timestamp (e.g. 30 minutes either side).",
      inputSchema: {
        trace_id: z.string().min(1).describe('APM trace ID, e.g. the trace_id=... value on a datadog_search_logs line'),
        from: z
          .string()
          .default('now-1h')
          .describe('Start time bracketing the trace: Datadog time math ("now-4h") or ISO 8601 with a time zone'),
        to: z
          .string()
          .default('now')
          .describe('End time: Datadog time math ("now") or ISO 8601 with a time zone (Z or offset)'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ trace_id, from, to }: { trace_id: string; from: string; to: string }): Promise<CallToolResult> => {
      try {
        resolveRange(from, to)
        const client = getDatadogClient()
        const { spans, truncated } = await client.listTraceSpans({ traceId: trace_id, from, to })
        if (spans.length === 0) {
          return textResult(
            `No spans found for trace_id "${trace_id}" between ${from} and ${to}. ` +
              'Widen the range so it brackets the timestamp of the log that carried this trace_id ' +
              '(e.g. 30 minutes either side); indexed spans are only searchable within their retention window.'
          )
        }
        return textResult(formatTrace(trace_id, spans, truncated))
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

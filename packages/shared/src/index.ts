/**
 * Wire types shared between the MCP server (apps/mcp-datadog-logs) and the
 * MCP Apps UI (packages/investigator-ui). Type-only — no runtime code.
 */

export type LogStatus = 'error' | 'warn' | 'info' | 'debug' | string

export interface InvestigationParams {
  /** Datadog logs search query, e.g. "service:payments status:error" */
  query: string
  /** Datadog time syntax ("now-4h") or ISO 8601 */
  from: string
  to: string
  /** Optional extra facet to break down by (e.g. "@http.status_code") */
  groupBy?: string
  /** Max log rows to return (server clamps to its own limit) */
  limit?: number
  /** Pagination cursor for load-more */
  cursor?: string
  /** Human title for the investigation / report */
  title?: string
}

export interface LogRow {
  id: string
  /** ISO 8601 timestamp */
  timestamp: string
  status: LogStatus
  service?: string
  host?: string
  /** Message, possibly truncated (see messageTruncated) */
  message: string
  messageTruncated?: boolean
  /** Capped list of tags */
  tags?: string[]
}

export interface TimelineBucket {
  /** Bucket start, ISO 8601 */
  time: string
  /** Counts keyed by status (error/warn/info/debug/...) */
  counts: Record<string, number>
}

export interface FacetValueCount {
  value: string
  count: number
}

export interface FacetBreakdown {
  /** Facet name, e.g. "service", "status", "host", or custom groupBy */
  facet: string
  values: FacetValueCount[]
  /** Count rolled into "other" beyond the returned values */
  otherCount?: number
}

export interface InvestigationResult {
  params: InvestigationParams
  /** Approximate total matching logs (from aggregation) */
  totalCount: number
  timeline: TimelineBucket[]
  /** Interval used for the timeline, e.g. "5m" */
  interval: string
  facets: FacetBreakdown[]
  rows: LogRow[]
  /** Cursor to fetch the next page of rows, if any */
  nextCursor?: string
  /** ISO 8601 — when this result was produced */
  fetchedAt: string
  /** AI-authored findings/notes for this investigation (plain text, may contain line breaks) */
  findings?: string
  /** Resolved absolute time range (epoch ms) for display */
  resolvedRange: { fromMs: number; toMs: number }
}

/** Payload of _get_view_state / _run_investigation when the view is unknown */
export interface ViewNotFound {
  notFound: true
}

export interface ExportResult {
  ok: boolean
  path?: string
  /** True when the server successfully launched, or likely launched, the system browser. */
  opened?: boolean
  /** HTML export succeeded, but launching the browser failed. */
  openError?: string
  error?: string
}

/** Regex contract: tool result text contains `viewUUID: <uuid>` */
export const VIEW_UUID_PATTERN = 'viewUUID:\\s*([0-9a-fA-F-]{36})'

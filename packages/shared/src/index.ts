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
  /** Fetch Datadog events (deploys, alerts) for the same window. Default true. */
  includeEvents?: boolean
  /** Events search query; defaults to all events in the window */
  eventsQuery?: string
  /** Metric queries to fetch alongside logs (classic query strings, server caps the count) */
  metricsQueries?: string[]
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
  /** APM trace id extracted from the log's attributes, for pivoting to datadog_get_trace */
  traceId?: string
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

export type EventMarkerKind = 'deploy' | 'alert' | 'other'

/** A Datadog event (deploy, monitor alert, config change) overlaid on the investigation timeline. */
export interface EventMarker {
  id: string
  /** ISO 8601 */
  time: string
  kind: EventMarkerKind
  /** Event title, truncated */
  title: string
  /** Event status: info/warning/error */
  status?: string
  /** Event source, e.g. "github", "alert" */
  source?: string
  /** Capped list of tags */
  tags?: string[]
}

export interface MetricPoint {
  /** ISO 8601 bucket time */
  time: string
  /** null = no data in the bucket (renders as a gap) */
  value: number | null
}

/** One timeseries returned by a metric query, downsampled for transport. */
export interface MetricSeries {
  /** The metricsQueries entry that produced this series */
  query: string
  /** Metric expression, e.g. "avg:system.cpu.user" */
  metric: string
  /** Series scope, e.g. "service:web,host:i-0a1b" */
  scope?: string
  /** Unit short name, e.g. "%" or "ms" */
  unit?: string
  /** Downsampled points (server caps the count) */
  points: MetricPoint[]
  /** Stats computed over the raw (pre-downsample) values */
  stats: { min: number; max: number; avg: number; last: number | null }
}

/** An APM trace id seen on stored log rows — a pivot candidate for datadog_get_trace. */
export interface TraceCandidate {
  traceId: string
  /** Stored rows carrying this trace id */
  count: number
  errorCount: number
  /** ISO 8601 of the earliest row */
  firstSeen: string
  /** Up to a few distinct services seen on those rows */
  services: string[]
  /** First error (or first) message, truncated */
  sampleMessage?: string
}

export interface LogPattern {
  /** Normalized message template; variable parts replaced with "<*>" */
  template: string
  count: number
  /** count / analyzed row count, 0–1 */
  ratio: number
  /** First raw message that produced this template */
  example: string
  /** Ids of the analyzed rows belonging to this pattern (client-side filtering) */
  rowIds: string[]
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
  /** Message templates clustered from the fetched rows (not the full match set) */
  patterns?: LogPattern[]
  /** Resolved absolute time range (epoch ms) for display */
  resolvedRange: { fromMs: number; toMs: number }
  /** Datadog events in the window (deploys, alerts), chronological */
  events?: EventMarker[]
  /** Metric series fetched via params.metricsQueries */
  metrics?: MetricSeries[]
  /** Trace ids extracted from stored rows, error-heavy first */
  traceCandidates?: TraceCandidate[]
  /** Human-readable notes about degraded cross-source fetches (missing scopes etc.) */
  notices?: string[]
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

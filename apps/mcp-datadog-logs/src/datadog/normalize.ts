import type { FacetBreakdown, LogRow, TimelineBucket } from '@kajidog/investigation-shared'

export interface NormalizeCaps {
  maxRows: number
  maxMessageLength: number
  maxTags: number
  maxTimelineBuckets: number
  maxFacetValues: number
}

export const DEFAULT_CAPS: NormalizeCaps = {
  maxRows: 200,
  maxMessageLength: 500,
  maxTags: 20,
  maxTimelineBuckets: 120,
  maxFacetValues: 15,
}

/**
 * Structural subset of the Datadog SDK response types. Kept minimal so
 * normalization can be tested with plain fixtures and survives SDK upgrades.
 */
export interface RawLog {
  id?: string
  attributes?: {
    timestamp?: Date | string
    status?: string
    service?: string
    host?: string
    message?: string
    tags?: string[]
    attributes?: Record<string, unknown>
  }
}

/** Structural subset of the Datadog SDK Span type (v2.SpansApi). */
export interface RawSpan {
  id?: string
  attributes?: {
    spanId?: string
    parentId?: string
    traceId?: string
    service?: string
    resourceName?: string
    type?: string
    env?: string
    host?: string
    startTimestamp?: Date | string
    endTimestamp?: Date | string
    tags?: string[]
    custom?: Record<string, unknown>
    attributes?: Record<string, unknown>
  }
}

/** Structural subset of the Datadog SDK EventResponse type (v2.EventsApi). */
export interface RawEvent {
  id?: string
  attributes?: {
    timestamp?: Date | string
    message?: string
    tags?: string[]
    attributes?: {
      title?: string
      status?: string
      service?: string
      sourceTypeName?: string
    } & Record<string, unknown>
  }
}

export interface RawTimeseriesPoint {
  time?: Date | string
  value?: number
}

export interface RawAggregateBucket {
  by?: Record<string, unknown>
  computes?: Record<string, RawTimeseriesPoint[] | number | string | undefined>
}

export function toIso(value: Date | string | undefined): string {
  if (value === undefined) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

export function normalizeStatus(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'warning') {
    return 'warn'
  }
  if (s === 'err' || s === 'critical' || s === 'emergency' || s === 'alert') {
    return 'error'
  }
  return s || 'info'
}

export function normalizeLogRow(raw: RawLog, caps: NormalizeCaps = DEFAULT_CAPS): LogRow {
  const attrs = raw.attributes ?? {}
  const message = attrs.message ?? ''
  const truncated = message.length > caps.maxMessageLength
  const tags = attrs.tags?.slice(0, caps.maxTags)
  return {
    id: raw.id ?? '',
    timestamp: toIso(attrs.timestamp),
    status: normalizeStatus(attrs.status),
    service: attrs.service,
    host: attrs.host ?? extractHostFromAttributes(attrs.attributes),
    message: truncated ? message.slice(0, caps.maxMessageLength) : message,
    ...(truncated ? { messageTruncated: true } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
  }
}

function extractHostFromAttributes(attributes: Record<string, unknown> | undefined): string | undefined {
  const host = attributes?.host
  return typeof host === 'string' ? host : undefined
}

/**
 * Resolves the APM trace id from a log's custom attribute bag. Datadog logs
 * carry it as `trace_id` (standard remapper), a flattened `dd.trace_id` key,
 * or nested under `dd`.
 */
export function extractTraceId(attributes: Record<string, unknown> | undefined): string | undefined {
  if (!attributes) {
    return undefined
  }
  const dd = attributes.dd
  const candidate =
    attributes.trace_id ??
    attributes['dd.trace_id'] ??
    (typeof dd === 'object' && dd !== null ? (dd as Record<string, unknown>).trace_id : undefined)
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined
}

/**
 * Dot-path lookup into a log attribute bag. A literal key containing dots
 * wins over path traversal because Datadog often stores attributes flattened
 * (e.g. "http.status_code" as a single key).
 */
export function lookupAttribute(bag: Record<string, unknown> | undefined, path: string): unknown {
  if (!bag) {
    return undefined
  }
  if (path in bag) {
    return bag[path]
  }
  let current: unknown = bag
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** Compact stringification for key=value output appended to log lines. */
export function formatAttributeValue(value: unknown, maxLength = 100): string {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * Converts aggregateLogs timeseries buckets (grouped by status) into
 * TimelineBucket[] sorted by time. Each Datadog bucket carries one status in
 * `by` and an array of {time,value} points in `computes.c0`.
 */
export function normalizeTimeline(buckets: RawAggregateBucket[], caps: NormalizeCaps = DEFAULT_CAPS): TimelineBucket[] {
  return normalizeTimelineByFacet(buckets, 'status', caps)
}

/** Converts facet-grouped aggregateLogs timeseries buckets into counts by time. */
export function normalizeTimelineByFacet(
  buckets: RawAggregateBucket[],
  facet: string,
  caps: NormalizeCaps = DEFAULT_CAPS
): TimelineBucket[] {
  const byTime = new Map<string, Record<string, number>>()
  for (const bucket of buckets) {
    const rawValue = bucket.by?.[facet] ?? firstValue(bucket.by)
    const value = facet === 'status' ? normalizeStatus(toOptionalString(rawValue)) : String(rawValue ?? 'N/A')
    const points = bucket.computes?.c0
    if (!Array.isArray(points)) {
      continue
    }
    for (const point of points) {
      const time = toIso(point.time)
      if (!time) {
        continue
      }
      const counts = byTime.get(time) ?? {}
      counts[value] = (counts[value] ?? 0) + (point.value ?? 0)
      byTime.set(time, counts)
    }
  }
  const sorted = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, counts]) => ({ time, counts }))
  return sorted.slice(0, caps.maxTimelineBuckets)
}

function firstValue(by: Record<string, unknown> | undefined): unknown {
  return by ? Object.values(by)[0] : undefined
}

function toOptionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

function firstStringValue(by: Record<string, unknown> | undefined): string | undefined {
  if (!by) {
    return undefined
  }
  for (const value of Object.values(by)) {
    if (typeof value === 'string') {
      return value
    }
  }
  return undefined
}

/**
 * Converts aggregateLogs total-count buckets (grouped by one facet) into a
 * FacetBreakdown, rolling values beyond maxFacetValues into otherCount.
 */
export function normalizeFacet(
  facet: string,
  buckets: RawAggregateBucket[],
  caps: NormalizeCaps = DEFAULT_CAPS
): FacetBreakdown {
  const values = buckets
    .map((bucket) => {
      const raw = bucket.by?.[facet] ?? firstStringValue(bucket.by)
      const compute = bucket.computes?.c0
      const count = typeof compute === 'number' ? compute : Number(compute ?? 0)
      return { value: String(raw ?? 'N/A'), count: Number.isFinite(count) ? count : 0 }
    })
    .sort((a, b) => b.count - a.count)
  const kept = values.slice(0, caps.maxFacetValues)
  const otherCount = values.slice(caps.maxFacetValues).reduce((sum, v) => sum + v.count, 0)
  return {
    facet,
    values: kept,
    ...(otherCount > 0 ? { otherCount } : {}),
  }
}

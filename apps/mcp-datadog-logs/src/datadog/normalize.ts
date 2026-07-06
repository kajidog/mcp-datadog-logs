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

export interface RawTimeseriesPoint {
  time?: Date | string
  value?: number
}

export interface RawAggregateBucket {
  by?: Record<string, unknown>
  computes?: Record<string, RawTimeseriesPoint[] | number | string | undefined>
}

function toIso(value: Date | string | undefined): string {
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
 * Converts aggregateLogs timeseries buckets (grouped by status) into
 * TimelineBucket[] sorted by time. Each Datadog bucket carries one status in
 * `by` and an array of {time,value} points in `computes.c0`.
 */
export function normalizeTimeline(buckets: RawAggregateBucket[], caps: NormalizeCaps = DEFAULT_CAPS): TimelineBucket[] {
  const byTime = new Map<string, Record<string, number>>()
  for (const bucket of buckets) {
    const status = normalizeStatus(firstStringValue(bucket.by))
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
      counts[status] = (counts[status] ?? 0) + (point.value ?? 0)
      byTime.set(time, counts)
    }
  }
  const sorted = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, counts]) => ({ time, counts }))
  return sorted.slice(0, caps.maxTimelineBuckets)
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

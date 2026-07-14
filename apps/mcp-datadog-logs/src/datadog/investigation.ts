import type {
  EventMarker,
  InvestigationParams,
  InvestigationResult,
  LogRow,
  MetricSeries,
  TraceCandidate,
} from '@kajidog/investigation-shared'
import { getServerConfig, HARD_MAX_ROWS } from '../config.js'
import type { DatadogLogsClient } from './client.js'
import { describeDatadogError } from './client.js'
import type { RawAggregateBucket, RawLog } from './normalize.js'
import {
  DEFAULT_CAPS,
  type NormalizeCaps,
  normalizeEventMarker,
  normalizeFacet,
  normalizeLogRow,
  normalizeMetricSeries,
  normalizeTimeline,
} from './normalize.js'
import { pickInterval, resolveRange } from './time.js'

export interface InvestigationOutput {
  result: InvestigationResult
  /** Full raw log events keyed by id — served via _get_log_detail. */
  rawById: Map<string, RawLog>
}

const BASE_FACETS = ['service', 'status', 'host']
const MAX_EVENTS = 30
const MAX_METRICS_QUERIES = 4
const MAX_TRACE_CANDIDATES = 5
const TRACE_SAMPLE_MESSAGE_LENGTH = 120

/**
 * Runs the full investigation pipeline: one page of logs, a status-grouped
 * timeseries for the timeline chart, per-facet total counts, and — unless
 * this is a load-more page — events and metric series for the same window.
 */
export async function runInvestigation(
  client: DatadogLogsClient,
  params: InvestigationParams
): Promise<InvestigationOutput> {
  const config = getServerConfig()
  const caps: NormalizeCaps = { ...DEFAULT_CAPS, maxRows: config.maxRows }
  const limit = Math.min(params.limit ?? config.maxRows, HARD_MAX_ROWS)

  const resolved = resolveRange(params.from, params.to)
  const interval = pickInterval(resolved.toMs - resolved.fromMs)

  const facets = [...BASE_FACETS]
  if (params.groupBy && !facets.includes(params.groupBy)) {
    facets.push(params.groupBy)
  }

  const base = { query: params.query, from: params.from, to: params.to }

  // Keep these calls sequential. A full investigation issues several Datadog
  // API requests (up to ~10 with events and metrics enabled); firing them all
  // at once makes small Datadog orgs hit 429 quickly.
  const search = await client.searchLogs({ ...base, limit, cursor: params.cursor, sort: '-timestamp' })
  const timeseriesBuckets = await client.aggregateTimeseriesByStatus({ ...base, interval: interval.label })
  const facetBuckets: RawAggregateBucket[][] = []
  for (const facet of facets) {
    facetBuckets.push(await client.aggregateByFacet({ ...base, facet }))
  }

  // Cross-source fetches degrade per-source: a missing scope (events_read,
  // timeseries_query) must never fail the whole investigation. Load-more
  // pages skip them entirely — the window is frozen, so the data is unchanged
  // and session-ops carries the previous result forward.
  const notices: string[] = []
  let events: EventMarker[] | undefined
  if (params.includeEvents !== false && !params.cursor) {
    try {
      const rawEvents = await client.searchEvents({
        query: params.eventsQuery ?? '*',
        from: params.from,
        to: params.to,
        limit: MAX_EVENTS,
      })
      events = rawEvents
        .map((event) => normalizeEventMarker(event, caps))
        .filter((event) => event.time !== '')
        .sort((a, b) => a.time.localeCompare(b.time))
    } catch (error) {
      notices.push(`Events unavailable: ${describeDatadogError(error, 'events_read')}`)
    }
  }

  let metrics: MetricSeries[] | undefined
  const metricsQueries = (params.metricsQueries ?? []).slice(0, MAX_METRICS_QUERIES)
  if (metricsQueries.length > 0 && !params.cursor) {
    metrics = []
    for (const metricQuery of metricsQueries) {
      try {
        const raw = await client.queryMetrics({
          query: metricQuery,
          fromSec: Math.floor(resolved.fromMs / 1000),
          toSec: Math.floor(resolved.toMs / 1000),
        })
        metrics.push(...normalizeMetricSeries(metricQuery, raw))
      } catch (error) {
        notices.push(`Metric query "${metricQuery}" failed: ${describeDatadogError(error, 'timeseries_query')}`)
      }
    }
  }

  const rawById = new Map<string, RawLog>()
  for (const log of search.logs) {
    if (log.id) {
      rawById.set(log.id, log)
    }
  }

  const facetBreakdowns = facets.map((facet, i) => normalizeFacet(facet, facetBuckets[i], caps))
  const statusFacet = facetBreakdowns.find((f) => f.facet === 'status')
  const totalCount = statusFacet
    ? statusFacet.values.reduce((sum, v) => sum + v.count, 0) + (statusFacet.otherCount ?? 0)
    : search.logs.length

  const rows = search.logs.map((log) => normalizeLogRow(log, caps))
  const traceCandidates = extractTraceCandidates(rows)

  // Cross-source fields are spread conditionally so an investigation that
  // doesn't use them produces the exact same result shape as before.
  const result: InvestigationResult = {
    params: { ...params, limit },
    totalCount,
    timeline: normalizeTimeline(timeseriesBuckets, caps),
    interval: interval.label,
    facets: facetBreakdowns,
    rows,
    ...(search.nextCursor ? { nextCursor: search.nextCursor } : {}),
    fetchedAt: new Date().toISOString(),
    resolvedRange: { fromMs: resolved.fromMs, toMs: resolved.toMs },
    ...(events !== undefined ? { events } : {}),
    ...(metrics !== undefined ? { metrics } : {}),
    ...(traceCandidates.length > 0 ? { traceCandidates } : {}),
    ...(notices.length > 0 ? { notices } : {}),
  }

  return { result, rawById }
}

/**
 * Groups stored rows by the trace id extracted from their attributes and
 * returns the most error-heavy traces — pivot candidates for
 * datadog_get_trace. Local computation only; no API calls.
 */
export function extractTraceCandidates(rows: LogRow[], limit = MAX_TRACE_CANDIDATES): TraceCandidate[] {
  const byTrace = new Map<string, { rows: LogRow[]; errorRows: LogRow[] }>()
  for (const row of rows) {
    if (!row.traceId) {
      continue
    }
    const entry = byTrace.get(row.traceId) ?? { rows: [], errorRows: [] }
    entry.rows.push(row)
    if (row.status === 'error') {
      entry.errorRows.push(row)
    }
    byTrace.set(row.traceId, entry)
  }
  const candidates: TraceCandidate[] = []
  for (const [traceId, entry] of byTrace) {
    const services = [...new Set(entry.rows.map((r) => r.service).filter((s): s is string => Boolean(s)))].slice(0, 3)
    const sample = (entry.errorRows[0] ?? entry.rows[0]).message
    const firstSeen = entry.rows.reduce(
      (earliest, row) => (row.timestamp && row.timestamp < earliest ? row.timestamp : earliest),
      entry.rows[0].timestamp
    )
    candidates.push({
      traceId,
      count: entry.rows.length,
      errorCount: entry.errorRows.length,
      firstSeen,
      services,
      ...(sample
        ? {
            sampleMessage:
              sample.length > TRACE_SAMPLE_MESSAGE_LENGTH ? `${sample.slice(0, TRACE_SAMPLE_MESSAGE_LENGTH)}…` : sample,
          }
        : {}),
    })
  }
  return candidates.sort((a, b) => b.errorCount - a.errorCount || b.count - a.count).slice(0, limit)
}

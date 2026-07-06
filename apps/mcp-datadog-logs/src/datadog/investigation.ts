import type { InvestigationParams, InvestigationResult } from '@kajidog/investigation-shared'
import { getServerConfig, HARD_MAX_ROWS } from '../config.js'
import type { DatadogLogsClient } from './client.js'
import type { RawAggregateBucket, RawLog } from './normalize.js'
import { DEFAULT_CAPS, type NormalizeCaps, normalizeFacet, normalizeLogRow, normalizeTimeline } from './normalize.js'
import { pickInterval, resolveRange } from './time.js'

export interface InvestigationOutput {
  result: InvestigationResult
  /** Full raw log events keyed by id — served via _get_log_detail. */
  rawById: Map<string, RawLog>
}

const BASE_FACETS = ['service', 'status', 'host']

/**
 * Runs the full investigation pipeline: one page of logs, a status-grouped
 * timeseries for the timeline chart, and per-facet total counts.
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

  // Keep these calls sequential. A full investigation issues several Logs API
  // requests; firing them all at once makes small Datadog orgs hit 429 quickly.
  const search = await client.searchLogs({ ...base, limit, cursor: params.cursor, sort: '-timestamp' })
  const timeseriesBuckets = await client.aggregateTimeseriesByStatus({ ...base, interval: interval.label })
  const facetBuckets: RawAggregateBucket[][] = []
  for (const facet of facets) {
    facetBuckets.push(await client.aggregateByFacet({ ...base, facet }))
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

  const result: InvestigationResult = {
    params: { ...params, limit },
    totalCount,
    timeline: normalizeTimeline(timeseriesBuckets, caps),
    interval: interval.label,
    facets: facetBreakdowns,
    rows: search.logs.map((log) => normalizeLogRow(log, caps)),
    ...(search.nextCursor ? { nextCursor: search.nextCursor } : {}),
    fetchedAt: new Date().toISOString(),
    resolvedRange: { fromMs: resolved.fromMs, toMs: resolved.toMs },
  }

  return { result, rawById }
}

import { client, v2 } from '@datadog/datadog-api-client'
import type { DatadogConfig } from '../config.js'
import { getDatadogConfig } from '../config.js'
import type { RawAggregateBucket, RawLog } from './normalize.js'

export interface SearchLogsParams {
  query: string
  from: string
  to: string
  limit: number
  sort?: 'timestamp' | '-timestamp'
  cursor?: string
}

export interface SearchLogsResult {
  logs: RawLog[]
  nextCursor?: string
}

export interface AggregateParams {
  query: string
  from: string
  to: string
}

export class DatadogLogsClient {
  private readonly api: v2.LogsApi
  private readonly indexes?: string[]
  readonly site: string

  constructor(config: DatadogConfig) {
    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: config.apiKey,
        appKeyAuth: config.appKey,
      },
    })
    configuration.setServerVariables({ site: config.site })
    this.api = new v2.LogsApi(configuration)
    this.indexes = config.indexes
    this.site = config.site
  }

  private filter(params: AggregateParams): v2.LogsQueryFilter {
    return {
      query: params.query,
      from: params.from,
      to: params.to,
      ...(this.indexes ? { indexes: this.indexes } : {}),
    }
  }

  async searchLogs(params: SearchLogsParams): Promise<SearchLogsResult> {
    const response = await this.api.listLogs({
      body: {
        filter: this.filter(params),
        sort: params.sort ?? '-timestamp',
        page: {
          limit: params.limit,
          ...(params.cursor ? { cursor: params.cursor } : {}),
        },
      },
    })
    return {
      logs: (response.data ?? []) as RawLog[],
      nextCursor: response.meta?.page?.after,
    }
  }

  /** Timeseries log counts grouped by status — powers the timeline chart. */
  async aggregateTimeseriesByStatus(params: AggregateParams & { interval: string }): Promise<RawAggregateBucket[]> {
    const response = await this.api.aggregateLogs({
      body: {
        compute: [{ aggregation: 'count', type: 'timeseries', interval: params.interval }],
        filter: this.filter(params),
        groupBy: [{ facet: 'status', limit: 10 }],
      },
    })
    return (response.data?.buckets ?? []) as RawAggregateBucket[]
  }

  /** Total log counts grouped by a single facet (e.g. service, host, @http.status_code). */
  async aggregateByFacet(params: AggregateParams & { facet: string; limit?: number }): Promise<RawAggregateBucket[]> {
    const response = await this.api.aggregateLogs({
      body: {
        compute: [{ aggregation: 'count', type: 'total' }],
        filter: this.filter(params),
        groupBy: [
          {
            facet: params.facet,
            limit: params.limit ?? 50,
            sort: { aggregation: 'count', order: 'desc', type: 'measure' },
          },
        ],
      },
    })
    return (response.data?.buckets ?? []) as RawAggregateBucket[]
  }
}

let cached: DatadogLogsClient | undefined

/** Lazy singleton so the server can start without credentials. */
export function getDatadogClient(): DatadogLogsClient {
  if (!cached) {
    cached = new DatadogLogsClient(getDatadogConfig())
  }
  return cached
}

/** Test hook. */
export function resetDatadogClient(): void {
  cached = undefined
}

/** Maps Datadog API failures to actionable messages for the model/user. */
export function describeDatadogError(error: unknown): string {
  const err = error as { code?: number; message?: string } | undefined
  const code = err?.code
  const message = err?.message ?? String(error)
  if (code === 403) {
    return (
      'Datadog API returned 403 Forbidden. Check that DD_API_KEY and DD_APP_KEY are valid, ' +
      'the application key has the logs_read_data scope, and DD_SITE matches your Datadog region.'
    )
  }
  if (code === 401) {
    return 'Datadog API returned 401 Unauthorized. Check DD_API_KEY.'
  }
  if (code === 429) {
    return 'Datadog API rate limit exceeded (429). Wait a moment and retry with a narrower query.'
  }
  if (code === 400) {
    return `Datadog API rejected the request (400). Check the query syntax and time range. Details: ${message}`
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    return `Could not reach the Datadog API. Check network access and DD_SITE. Details: ${message}`
  }
  // Config/validation errors raised by this server already carry actionable text.
  if (/credentials are not configured|Unrecognized time value|Invalid time range/.test(message)) {
    return message
  }
  return `Datadog API error: ${message}`
}

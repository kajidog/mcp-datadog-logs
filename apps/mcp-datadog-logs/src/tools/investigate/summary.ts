import type { InvestigationResult, LogRow } from '@kajidog/investigation-shared'

export interface SummaryOptions {
  /** Sample log lines to inline (0 = none) */
  sampleRows?: number
  /** Top values shown per facet */
  topFacetValues?: number
  /** Top message patterns to inline (0 = none) */
  topPatterns?: number
}

export const MAX_SAMPLE_MESSAGE_LENGTH = 200
const MAX_PATTERN_TEMPLATE_LENGTH = 120

/**
 * Compact, model-facing summary of an investigation. The first line carries
 * the `viewUUID: <uuid>` contract (VIEW_UUID_PATTERN) that the investigator
 * UI extracts from tool result text, so it must stay on line one.
 */
export function formatInvestigationSummary(
  result: InvestigationResult,
  viewUUID: string,
  opts: SummaryOptions = {}
): string {
  const { sampleRows = 3, topFacetValues = 3, topPatterns = 5 } = opts
  const lines: string[] = [`viewUUID: ${viewUUID}`]
  lines.push(`Query: ${result.params.query} | Range: ${result.params.from} → ${result.params.to}`)

  const statusFacet = result.facets.find((f) => f.facet === 'status')
  const statusCounts = (statusFacet?.values ?? []).map((v) => `${v.value}: ${v.count.toLocaleString('en-US')}`)
  lines.push(
    `Total: ~${result.totalCount.toLocaleString('en-US')} logs` +
      (statusCounts.length > 0 ? ` — ${statusCounts.join(', ')}` : '')
  )

  for (const facet of result.facets) {
    if (facet.facet === 'status' || facet.values.length === 0) {
      continue
    }
    const shown = facet.values.slice(0, topFacetValues)
    const top = shown.map((v) => `${v.value} (${v.count.toLocaleString('en-US')})`).join(', ')
    const restValues = facet.values.length - shown.length
    const more = restValues > 0 ? ` +${restValues} more` : ''
    const other = facet.otherCount ? `, (other) ${facet.otherCount.toLocaleString('en-US')}` : ''
    lines.push(`${facet.facet}: ${top}${more}${other}`)
  }

  const patterns = result.patterns ?? []
  if (topPatterns > 0 && patterns.length > 0) {
    const shown = patterns.slice(0, topPatterns)
    const rest = patterns.length - shown.length
    lines.push(`Top patterns (of ${result.rows.length} fetched rows)${rest > 0 ? ` +${rest} more` : ''}:`)
    shown.forEach((pattern, i) => {
      let template = pattern.template.replace(/\s+/g, ' ').trim()
      if (template.length > MAX_PATTERN_TEMPLATE_LENGTH) {
        template = `${template.slice(0, MAX_PATTERN_TEMPLATE_LENGTH)}…`
      }
      lines.push(
        `  #${i + 1} ${pattern.count.toLocaleString('en-US')} (${Math.round(pattern.ratio * 100)}%) ${template}`
      )
    })
  }

  if (sampleRows > 0 && result.rows.length > 0) {
    const samples = pickSampleRows(result.rows, sampleRows)
    lines.push(`Sample logs (${samples.length} of ${result.rows.length} stored, errors first):`)
    for (const { row, index } of samples) {
      lines.push(formatSampleLine(row, index))
    }
  } else if (result.rows.length > 0) {
    lines.push(`${result.rows.length} log rows stored in the session.`)
  }

  if (result.nextCursor) {
    lines.push(`nextCursor: ${result.nextCursor}`)
  }
  return lines.join('\n')
}

/**
 * Picks sample rows for the summary: error rows first, then warn, then the
 * rest, each group in stored order. Keeps the absolute index into
 * `result.rows` so samples can be referenced as `row=<N>` in
 * datadog_get_session_logs.
 */
function pickSampleRows(rows: LogRow[], count: number): Array<{ row: LogRow; index: number }> {
  const indexed = rows.map((row, index) => ({ row, index }))
  const rank = (status: string): number => (status === 'error' ? 0 : status === 'warn' ? 1 : 2)
  return indexed.sort((a, b) => rank(a.row.status) - rank(b.row.status) || a.index - b.index).slice(0, count)
}

/**
 * One compact text line for a stored log row. `index` is the row's absolute
 * position in the session's rows array — the `[N]` reference accepted as
 * `row` by datadog_get_session_logs.
 */
export function formatSampleLine(row: LogRow, index?: number): string {
  let message = row.message.replace(/\s+/g, ' ').trim() || '(no message)'
  if (message.length > MAX_SAMPLE_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_SAMPLE_MESSAGE_LENGTH)}…`
  }
  const parts = [
    index === undefined ? undefined : `[${index}]`,
    row.timestamp,
    `[${row.status.toUpperCase()}]`,
    row.service ?? '-',
    row.host ? `host=${row.host}` : undefined,
    '—',
    message,
  ]
  return parts.filter(Boolean).join(' ')
}

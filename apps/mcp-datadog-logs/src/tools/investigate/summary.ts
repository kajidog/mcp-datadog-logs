import type { InvestigationResult, LogRow } from '@kajidog/investigation-shared'

export interface SummaryOptions {
  /** Sample log lines to inline (0 = none) */
  sampleRows?: number
  /** Top values shown per facet */
  topFacetValues?: number
}

const MAX_SAMPLE_MESSAGE_LENGTH = 200

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
  const { sampleRows = 3, topFacetValues = 3 } = opts
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

  if (sampleRows > 0 && result.rows.length > 0) {
    const samples = result.rows.slice(0, sampleRows)
    lines.push(`Sample logs (${samples.length} of ${result.rows.length} stored):`)
    for (const row of samples) {
      lines.push(formatSampleLine(row))
    }
  } else if (result.rows.length > 0) {
    lines.push(`${result.rows.length} log rows stored in the session.`)
  }

  if (result.nextCursor) {
    lines.push(`nextCursor: ${result.nextCursor}`)
  }
  return lines.join('\n')
}

function formatSampleLine(row: LogRow): string {
  let message = row.message.replace(/\s+/g, ' ').trim() || '(no message)'
  if (message.length > MAX_SAMPLE_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_SAMPLE_MESSAGE_LENGTH)}…`
  }
  const parts = [
    row.timestamp,
    `[${row.status.toUpperCase()}]`,
    row.service ?? '-',
    row.host ? `host=${row.host}` : undefined,
    '—',
    message,
  ]
  return parts.filter(Boolean).join(' ')
}

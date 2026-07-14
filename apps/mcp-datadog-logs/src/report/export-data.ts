import type { InvestigationResult, LogRow } from '@kajidog/investigation-shared'

export interface ExportDataOptions {
  title?: string
  /** Subset of rows to export; defaults to every stored row */
  rows?: LogRow[]
}

const CSV_COLUMNS = ['id', 'timestamp', 'status', 'service', 'host', 'message', 'tags', 'trace_id'] as const

/** UTF-8 BOM so Excel detects the encoding. */
const BOM = '\ufeff'

export function investigationToCsv(result: InvestigationResult, opts: ExportDataOptions = {}): string {
  const rows = opts.rows ?? result.rows
  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.timestamp,
        row.status,
        row.service ?? '',
        row.host ?? '',
        row.message,
        // Tags may contain commas, so join with ";" inside one field.
        (row.tags ?? []).join(';'),
        row.traceId ?? '',
      ]
        .map(csvField)
        .join(',')
    )
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}

export function investigationToJson(result: InvestigationResult, opts: ExportDataOptions = {}): string {
  const rows = opts.rows ?? result.rows
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      ...(opts.title ? { title: opts.title } : {}),
      query: result.params.query,
      from: result.params.from,
      to: result.params.to,
      resolvedRange: result.resolvedRange,
      fetchedAt: result.fetchedAt,
      totalCount: result.totalCount,
      rowCount: rows.length,
      ...(result.findings ? { findings: result.findings } : {}),
      ...(result.patterns && result.patterns.length > 0
        ? { patterns: result.patterns.map(({ rowIds: _rowIds, ...pattern }) => pattern) }
        : {}),
    },
    rows,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

/**
 * RFC 4180: quote fields containing separators/quotes/newlines, double inner
 * quotes. Log content is untrusted and the export targets spreadsheets, so
 * fields starting with a formula trigger (=, +, -, @, tab, CR) are neutralized
 * with a leading apostrophe first — quoting alone does not stop Excel/Sheets
 * from evaluating them after parsing (CWE-1236).
 */
function csvField(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`
  }
  return neutralized
}

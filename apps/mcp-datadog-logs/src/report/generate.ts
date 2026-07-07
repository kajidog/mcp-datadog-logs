import type { FacetBreakdown, InvestigationResult, LogRow } from '@kajidog/investigation-shared'
import type { RawLog } from '../datadog/normalize.js'
import { REPORT_JS } from './script.js'
import { REPORT_CSS } from './styles.js'
import { renderTimelineSvg, stackStatuses, statusColor } from './svg-timeline.js'

const MAX_RAW_JSON_CHARS = 4_000
const KNOWN_STATUS_CLASSES = new Set(['error', 'warn', 'info', 'debug'])

export interface ReportOptions {
  title?: string
  site?: string
  /** IANA time zone for displayed timestamps; invalid values fall back to UTC */
  timeZone?: string
}

/**
 * Generates a self-contained single-file HTML report. Log content is
 * arbitrary user data — every dynamic value must pass through escapeHtml.
 */
export function generateReport(
  result: InvestigationResult,
  rawById: Map<string, RawLog>,
  options: ReportOptions = {}
): string {
  const title = options.title?.trim() || 'Datadog Logs Investigation'
  const { timeZone, format: formatTs } = timestampFormatter(options.timeZone ?? 'UTC')
  const generatedAt = `${formatTs(Date.now())} (${timeZone})`
  const range = `${formatTs(result.resolvedRange.fromMs)} → ${formatTs(result.resolvedRange.toMs)} (${timeZone})`

  return `<!DOCTYPE html>
<html lang="en" data-time-zone="${escapeHtml(timeZone)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        Query: <code>${escapeHtml(result.params.query)}</code><br>
        Range: ${escapeHtml(result.params.from)} → ${escapeHtml(result.params.to)} — ${escapeHtml(range)}<br>
        Generated: ${escapeHtml(generatedAt)}${options.site ? ` · Site: ${escapeHtml(options.site)}` : ''}
      </div>
    </div>
    <div class="theme-toggle" role="group" aria-label="Color theme">
      <button type="button" data-theme-value="auto">Auto</button>
      <button type="button" data-theme-value="light">Light</button>
      <button type="button" data-theme-value="dark">Dark</button>
    </div>
  </header>
  ${renderStatTiles(result)}
  ${renderFindingsSection(result.findings)}
  ${renderTimelineSection(result, timeZone)}
  ${renderFacetsSection(result.facets)}
  ${renderLogsSection(result, rawById, formatTs)}
  <footer>Exported by @kajidog/mcp-datadog-logs · ${escapeHtml(result.rows.length.toString())} of ~${escapeHtml(result.totalCount.toString())} matching logs included</footer>
</main>
<script>${REPORT_JS}</script>
</body>
</html>
`
}

function renderStatTiles(result: InvestigationResult): string {
  const statusFacet = result.facets.find((f) => f.facet === 'status')
  const count = (status: string) => statusFacet?.values.find((v) => v.value === status)?.count ?? 0
  const serviceFacet = result.facets.find((f) => f.facet === 'service')
  const serviceCount = (serviceFacet?.values.length ?? 0) + (serviceFacet?.otherCount ? 1 : 0)
  const errors = count('error')
  return `<section class="tiles">
    <div class="card tile"><div class="label">Total logs</div><div class="value">${formatCount(result.totalCount)}</div></div>
    <div class="card tile"><div class="label">Errors</div><div class="value${errors > 0 ? ' error' : ''}">${formatCount(errors)}</div></div>
    <div class="card tile"><div class="label">Warnings</div><div class="value">${formatCount(count('warn'))}</div></div>
    <div class="card tile"><div class="label">Services</div><div class="value">${formatCount(serviceCount)}</div></div>
  </section>`
}

function renderFindingsSection(findings: string | undefined): string {
  if (!findings) {
    return ''
  }
  return `<section>
    <h2>AI Findings</h2>
    <div class="card"><p class="findings">${escapeHtml(findings)}</p></div>
  </section>`
}

function renderTimelineSection(result: InvestigationResult, timeZone: string): string {
  const rangeMs = result.resolvedRange.toMs - result.resolvedRange.fromMs
  const svg = renderTimelineSvg(result.timeline, { rangeMs, endMs: result.resolvedRange.toMs, timeZone })
  const legend = stackStatuses(result.timeline)
    .reverse()
    .map(
      (status) =>
        `<button type="button" class="item" data-status="${escapeHtml(status)}" aria-pressed="false"><span class="swatch" style="background:${statusColor(status)}"></span>${escapeHtml(status)}</button>`
    )
    .join('')
  return `<section>
    <h2>Log volume (per ${escapeHtml(result.interval)})</h2>
    <div class="card timeline">
      <div class="chart-scroll">${svg}</div>
      ${legend ? `<div class="legend">${legend}</div>` : ''}
      <p class="chart-hint">Click a bar to filter the log list to that time bucket; click a legend status to filter by status. Click again to clear.</p>
    </div>
  </section>`
}

function renderFacetsSection(facets: FacetBreakdown[]): string {
  if (facets.length === 0) {
    return ''
  }
  const cards = facets
    .map((facet) => {
      const rows = facet.values
        .map((v) => `<tr><td>${escapeHtml(v.value)}</td><td class="num">${formatCount(v.count)}</td></tr>`)
        .join('')
      const other = facet.otherCount
        ? `<tr><td>(other)</td><td class="num">${formatCount(facet.otherCount)}</td></tr>`
        : ''
      return `<div class="card">
        <h2>${escapeHtml(facet.facet)}</h2>
        <table><thead><tr><th>Value</th><th style="text-align:right">Count</th></tr></thead>
        <tbody>${rows}${other}</tbody></table>
      </div>`
    })
    .join('')
  return `<section><h2>Breakdowns</h2><div class="facets">${cards}</div></section>`
}

function renderLogsSection(
  result: InvestigationResult,
  rawById: Map<string, RawLog>,
  formatTs: (ms: number) => string
): string {
  const entries = result.rows.map((row) => renderLogEntry(row, rawById.get(row.id), formatTs)).join('')
  return `<section>
    <h2>Logs (${result.rows.length})</h2>
    <div class="log-toolbar">
      <input id="log-search" type="search" placeholder="Filter logs by text…" aria-label="Filter logs by text">
      <span id="active-filters"></span>
      <button type="button" id="clear-filters" hidden>Clear filters</button>
      <span class="count" id="log-count"></span>
    </div>
    <div class="card logs">${entries || '<p>No log entries.</p>'}<p class="no-match" id="log-no-match" hidden>No logs match the current filters.</p></div>
  </section>`
}

function renderLogEntry(row: LogRow, raw: RawLog | undefined, formatTs: (ms: number) => string): string {
  const statusClass = KNOWN_STATUS_CLASSES.has(row.status) ? row.status : 'other'
  let detail = raw ? JSON.stringify(raw, null, 2) : JSON.stringify(row, null, 2)
  if (detail.length > MAX_RAW_JSON_CHARS) {
    detail = `${detail.slice(0, MAX_RAW_JSON_CHARS)}\n… (truncated)`
  }
  const tsMs = Date.parse(row.timestamp)
  return `<details data-status="${escapeHtml(row.status)}"${Number.isNaN(tsMs) ? '' : ` data-ts="${tsMs}"`}>
    <summary>
      <span class="time">${escapeHtml(Number.isNaN(tsMs) ? row.timestamp : formatTs(tsMs))}</span>
      <span class="status-badge ${statusClass}">${escapeHtml(row.status)}</span>
      <span class="service">${escapeHtml(row.service ?? '-')}</span>
      <span class="message">${escapeHtml(row.message || '(no message)')}</span>
    </summary>
    <pre>${escapeHtml(detail)}</pre>
  </details>`
}

/** "YYYY-MM-DD HH:mm:ss" formatter in the given zone; invalid zones fall back to UTC. */
function timestampFormatter(timeZone: string): { timeZone: string; format: (ms: number) => string } {
  try {
    return { timeZone, format: buildTimestampFormat(timeZone) }
  } catch {
    return { timeZone: 'UTC', format: buildTimestampFormat('UTC') }
  }
}

function buildTimestampFormat(timeZone: string): (ms: number) => string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  return (ms) => {
    const byType: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
    for (const part of fmt.formatToParts(new Date(ms))) {
      byType[part.type] = part.value
    }
    return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}:${byType.second}`
  }
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

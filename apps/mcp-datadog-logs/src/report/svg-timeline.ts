import type { TimelineBucket } from '@kajidog/investigation-shared'

/** Bottom-to-top stacking order; unknown statuses render above these. */
const STACK_ORDER = ['debug', 'info', 'warn', 'error']

export const STATUS_COLOR_VAR: Record<string, string> = {
  error: 'var(--status-error)',
  warn: 'var(--status-warn)',
  info: 'var(--status-info)',
  debug: 'var(--status-debug)',
}

export function statusColor(status: string): string {
  return STATUS_COLOR_VAR[status] ?? 'var(--status-debug)'
}

export function stackStatuses(timeline: TimelineBucket[]): string[] {
  const seen = new Set(timeline.flatMap((b) => Object.keys(b.counts)))
  const ordered = STACK_ORDER.filter((s) => seen.has(s))
  const extras = [...seen].filter((s) => !STACK_ORDER.includes(s)).sort()
  return [...ordered, ...extras]
}

interface TimelineSvgOptions {
  width?: number
  height?: number
  rangeMs?: number
}

/**
 * Renders the timeline as a stacked bar SVG string (no dependencies).
 * Marks follow the dataviz spec: 2px gaps between bars, recessive hairline
 * gridlines, muted axis labels using chart-chrome CSS variables.
 */
export function renderTimelineSvg(timeline: TimelineBucket[], options: TimelineSvgOptions = {}): string {
  const width = options.width ?? 1000
  const height = options.height ?? 220
  const pad = { top: 10, right: 8, bottom: 24, left: 44 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom

  if (timeline.length === 0) {
    return (
      `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Timeline: no data">` +
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="var(--text-muted)" font-size="13">No data in range</text>` +
      `</svg>`
    )
  }

  const statuses = stackStatuses(timeline)
  const totals = timeline.map((b) => statuses.reduce((sum, s) => sum + (b.counts[s] ?? 0), 0))
  const maxTotal = Math.max(...totals, 1)

  const n = timeline.length
  const gap = 2
  const barW = Math.max((plotW - gap * (n - 1)) / n, 1)

  const parts: string[] = []
  parts.push(
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Log volume over time by status" font-family="system-ui, sans-serif">`
  )

  // Horizontal gridlines + y labels at 0 / 50% / 100% of max.
  for (const frac of [0, 0.5, 1]) {
    const y = pad.top + plotH * (1 - frac)
    const value = Math.round(maxTotal * frac)
    parts.push(
      `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="${frac === 0 ? 'var(--baseline)' : 'var(--gridline)'}" stroke-width="1"/>`
    )
    parts.push(
      `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="11">${value}</text>`
    )
  }

  const labelEvery = Math.max(1, Math.ceil(n / 8))
  const useDateLabel = (options.rangeMs ?? 0) > 86_400_000

  timeline.forEach((bucket, i) => {
    const x = pad.left + i * (barW + gap)
    let yCursor = pad.top + plotH
    for (const status of statuses) {
      const count = bucket.counts[status] ?? 0
      if (count <= 0) {
        continue
      }
      const h = (count / maxTotal) * plotH
      yCursor -= h
      const drawH = Math.max(h - 1, 0.5)
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${drawH.toFixed(1)}" fill="${statusColor(status)}" rx="1"><title>${escapeXml(formatTime(bucket.time, useDateLabel))} ${status}: ${count}</title></rect>`
      )
    }
    if (i % labelEvery === 0) {
      parts.push(
        `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${escapeXml(formatTime(bucket.time, useDateLabel))}</text>`
      )
    }
  })

  parts.push('</svg>')
  return parts.join('')
}

function formatTime(iso: string, withDate: boolean): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  if (withDate) {
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(date.getUTCDate()).padStart(2, '0')
    return `${mo}/${dd} ${hh}:${mm}`
  }
  return `${hh}:${mm}`
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

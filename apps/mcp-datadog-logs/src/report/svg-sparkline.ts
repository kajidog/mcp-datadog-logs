import type { MetricPoint } from '@kajidog/investigation-shared'

interface SparklineOptions {
  width?: number
  height?: number
}

/**
 * Renders a metric series as a dependency-free polyline sparkline SVG string.
 * Null values break the line so data gaps render as gaps. Min/max labels sit
 * on the left edge using the chart-chrome CSS variables from styles.ts.
 */
export function renderSparklineSvg(points: MetricPoint[], options: SparklineOptions = {}): string {
  const width = options.width ?? 320
  const height = options.height ?? 72
  const pad = { top: 6, right: 4, bottom: 6, left: 4 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom

  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  if (points.length === 0 || values.length === 0) {
    return (
      `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Metric: no data">` +
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="var(--text-muted)" font-size="11">No data</text>` +
      `</svg>`
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0
  const toX = (i: number) => pad.left + i * stepX
  const toY = (value: number) => pad.top + (1 - (value - min) / span) * plotH

  // Split into segments at nulls so gaps stay visible.
  const segments: string[] = []
  let current: string[] = []
  points.forEach((point, i) => {
    if (point.value === null) {
      if (current.length > 0) {
        segments.push(current.join(' '))
        current = []
      }
      return
    }
    current.push(`${toX(i).toFixed(1)},${toY(point.value).toFixed(1)}`)
  })
  if (current.length > 0) {
    segments.push(current.join(' '))
  }

  const parts: string[] = [
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Metric sparkline" preserveAspectRatio="none">`,
    `<line x1="${pad.left}" y1="${(pad.top + plotH).toFixed(1)}" x2="${(width - pad.right).toFixed(1)}" y2="${(pad.top + plotH).toFixed(1)}" stroke="var(--gridline)" stroke-width="1"/>`,
  ]
  for (const segment of segments) {
    const coords = segment.split(' ')
    if (coords.length === 1) {
      const [x, y] = coords[0].split(',')
      parts.push(`<circle cx="${x}" cy="${y}" r="1.5" fill="var(--accent)"/>`)
    } else {
      parts.push(
        `<polyline points="${segment}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
      )
    }
  }
  parts.push('</svg>')
  return parts.join('')
}

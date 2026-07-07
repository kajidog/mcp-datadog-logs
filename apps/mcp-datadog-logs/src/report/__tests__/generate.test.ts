import type { InvestigationResult } from '@kajidog/investigation-shared'
import { describe, expect, it } from 'vitest'
import { escapeHtml, generateReport } from '../generate.js'
import { renderTimelineSvg } from '../svg-timeline.js'

function fixtureResult(): InvestigationResult {
  return {
    params: { query: 'service:payments status:error', from: 'now-1h', to: 'now' },
    totalCount: 123,
    timeline: [
      { time: '2026-07-06T10:00:00.000Z', counts: { error: 5, info: 40 } },
      { time: '2026-07-06T10:05:00.000Z', counts: { error: 3, warn: 2 } },
    ],
    interval: '5m',
    facets: [
      { facet: 'service', values: [{ value: 'payments', count: 100 }], otherCount: 23 },
      {
        facet: 'status',
        values: [
          { value: 'error', count: 8 },
          { value: 'info', count: 115 },
        ],
      },
    ],
    rows: [
      {
        id: 'log-1',
        timestamp: '2026-07-06T10:01:00.000Z',
        status: 'error',
        service: 'payments',
        message: '<script>alert("xss")</script> failed',
      },
    ],
    fetchedAt: '2026-07-06T10:10:00.000Z',
    resolvedRange: { fromMs: Date.parse('2026-07-06T09:10:00Z'), toMs: Date.parse('2026-07-06T10:10:00Z') },
  }
}

describe('generateReport', () => {
  it('escapes log content (XSS)', () => {
    const html = generateReport(fixtureResult(), new Map())
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; failed')
  })

  it('includes query, stats, facets and log entries', () => {
    const html = generateReport(fixtureResult(), new Map(), { title: 'Payment errors', site: 'ap1.datadoghq.com' })
    expect(html).toContain('<title>Payment errors</title>')
    expect(html).toContain('service:payments status:error')
    expect(html).toContain('ap1.datadoghq.com')
    expect(html).toContain('payments')
    expect(html).toContain('Total logs')
    expect(html).toContain('<details data-status=')
  })

  it('renders escaped AI findings when present', () => {
    const html = generateReport(
      { ...fixtureResult(), findings: 'Root cause: <script>alert(1)</script>\nline2' },
      new Map()
    )
    expect(html).toContain('AI Findings')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('Root cause: &lt;script&gt;alert(1)&lt;/script&gt;\nline2')
  })

  it('omits the findings section when findings are absent', () => {
    expect(generateReport(fixtureResult(), new Map())).not.toContain('AI Findings')
  })

  it('includes raw detail JSON when available, truncated when huge', () => {
    const raw = { id: 'log-1', attributes: { message: 'y'.repeat(10_000) } }
    const html = generateReport(fixtureResult(), new Map([['log-1', raw]]))
    expect(html).toContain('… (truncated)')
  })

  it('includes the interactive filter UI and inline script', () => {
    const html = generateReport(fixtureResult(), new Map())
    expect(html).toContain('id="log-search"')
    expect(html).toContain('id="clear-filters"')
    expect(html).toContain('<script>')
    expect(html).toContain('localStorage.getItem(THEME_KEY)')
  })

  it('includes a theme toggle and explicit light/dark theme CSS', () => {
    const html = generateReport(fixtureResult(), new Map())
    expect(html).toContain('data-theme-value="light"')
    expect(html).toContain('data-theme-value="dark"')
    expect(html).toContain('data-theme-value="auto"')
    expect(html).toContain(':root[data-theme="dark"]')
    expect(html).toContain(':root:not([data-theme="light"])')
  })

  it('annotates log entries with data attributes for filtering', () => {
    const html = generateReport(fixtureResult(), new Map())
    const tsMs = Date.parse('2026-07-06T10:01:00.000Z')
    expect(html).toContain(`<details data-status="error" data-ts="${tsMs}">`)
  })

  it('renders legend statuses as toggle buttons', () => {
    const html = generateReport(fixtureResult(), new Map())
    expect(html).toContain('class="item" data-status="error"')
  })
})

describe('renderTimelineSvg', () => {
  it('renders one stacked rect per non-zero status per bucket, plus a hit rect per bucket', () => {
    const svg = renderTimelineSvg(fixtureResult().timeline)
    const rects = svg.match(/<rect /g) ?? []
    // bucket1: hit+error+info (3), bucket2: hit+error+warn (3)
    expect(rects).toHaveLength(6)
    expect(svg.match(/<rect class="hit"/g)).toHaveLength(2)
  })

  it('wraps each bucket in a clickable group with its time range', () => {
    const timeline = fixtureResult().timeline
    const endMs = Date.parse('2026-07-06T10:10:00Z')
    const svg = renderTimelineSvg(timeline, { endMs })
    const from1 = Date.parse(timeline[0].time)
    const from2 = Date.parse(timeline[1].time)
    expect(svg).toContain(`<g class="bucket" data-from="${from1}" data-to="${from2}"`)
    expect(svg).toContain(`<g class="bucket" data-from="${from2}" data-to="${endMs}"`)
  })

  it('falls back to the previous bucket width for the last bucket without endMs', () => {
    const timeline = fixtureResult().timeline
    const svg = renderTimelineSvg(timeline)
    const from2 = Date.parse(timeline[1].time)
    const width = from2 - Date.parse(timeline[0].time)
    expect(svg).toContain(`data-from="${from2}" data-to="${from2 + width}"`)
  })

  it('renders a no-data message for an empty timeline', () => {
    expect(renderTimelineSvg([])).toContain('No data in range')
  })
})

describe('escapeHtml', () => {
  it('escapes all special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

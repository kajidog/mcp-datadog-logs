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
    expect(html).toContain('<details>')
  })

  it('includes raw detail JSON when available, truncated when huge', () => {
    const raw = { id: 'log-1', attributes: { message: 'y'.repeat(10_000) } }
    const html = generateReport(fixtureResult(), new Map([['log-1', raw]]))
    expect(html).toContain('… (truncated)')
  })
})

describe('renderTimelineSvg', () => {
  it('renders one stacked rect per non-zero status per bucket', () => {
    const svg = renderTimelineSvg(fixtureResult().timeline)
    const rects = svg.match(/<rect /g) ?? []
    // bucket1: error+info (2), bucket2: error+warn (2)
    expect(rects).toHaveLength(4)
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

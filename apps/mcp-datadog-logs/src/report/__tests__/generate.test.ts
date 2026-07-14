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

  it('renders AI findings as safe GFM Markdown', () => {
    const html = generateReport(
      {
        ...fixtureResult(),
        findings:
          '## Root cause\n\n- **Database timeout**\n- Retry exhausted\n\n| service | count |\n| --- | ---: |\n| api | 12 |\n\n[Runbook](https://example.com/runbook)\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))',
      },
      new Map()
    )
    expect(html).toContain('AI Findings')
    expect(html).toContain('<h2>Root cause</h2>')
    expect(html).toContain('<strong>Database timeout</strong>')
    expect(html).toContain('<table>')
    expect(html).toContain('href="https://example.com/runbook" target="_blank" rel="noreferrer noopener"')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&#x3C;script>alert(1)&#x3C;/script>')
    expect(html).not.toContain('href="javascript:')
  })

  it('omits the findings section when findings are absent', () => {
    expect(generateReport(fixtureResult(), new Map())).not.toContain('AI Findings')
  })

  it('renders escaped message patterns and omits the section when absent', () => {
    const withPatterns = generateReport(
      {
        ...fixtureResult(),
        patterns: [
          { template: '<script>boom</script> took <*>', count: 3, ratio: 0.75, example: 'boom took 3s', rowIds: [] },
        ],
      },
      new Map()
    )
    expect(withPatterns).toContain('Message patterns')
    expect(withPatterns).toContain('&lt;script&gt;boom&lt;/script&gt; took &lt;*&gt;')
    expect(withPatterns).not.toContain('<script>boom')
    expect(withPatterns).toContain('75%')

    expect(generateReport(fixtureResult(), new Map())).not.toContain('Message patterns')
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

  it('renders timestamps in UTC by default', () => {
    const html = generateReport(fixtureResult(), new Map())
    expect(html).toContain('data-time-zone="UTC"')
    expect(html).toContain('2026-07-06 09:10:00 → 2026-07-06 10:10:00 (UTC)')
    expect(html).toContain('<span class="time">2026-07-06 10:01:00</span>')
  })

  it('renders timestamps in the configured time zone', () => {
    const html = generateReport(fixtureResult(), new Map(), { timeZone: 'Asia/Tokyo' })
    expect(html).toContain('data-time-zone="Asia/Tokyo"')
    expect(html).toContain('timestamps in Asia/Tokyo')
    // 09:10/10:10 UTC → 18:10/19:10 JST
    expect(html).toContain('2026-07-06 18:10:00 → 2026-07-06 19:10:00 (Asia/Tokyo)')
    expect(html).toContain('<span class="time">2026-07-06 19:01:00</span>')
    // filtering epoch attributes stay timezone-independent
    expect(html).toContain(`data-ts="${Date.parse('2026-07-06T10:01:00.000Z')}"`)
  })

  it('falls back to UTC for an invalid time zone', () => {
    const html = generateReport(fixtureResult(), new Map(), { timeZone: 'Not/AZone' })
    expect(html).toContain('data-time-zone="UTC"')
    expect(html).toContain('(UTC)')
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

  it('renders axis labels in the configured time zone (UTC by default)', () => {
    const timeline = fixtureResult().timeline
    expect(renderTimelineSvg(timeline)).toContain('>10:00</text>')
    // 10:00 UTC → 19:00 JST
    expect(renderTimelineSvg(timeline, { timeZone: 'Asia/Tokyo' })).toContain('>19:00</text>')
    expect(renderTimelineSvg(timeline, { timeZone: 'Not/AZone' })).toContain('>10:00</text>')
  })
})

describe('escapeHtml', () => {
  it('escapes all special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('cross-source report sections', () => {
  function crossSourceResult(): InvestigationResult {
    return {
      ...fixtureResult(),
      events: [
        {
          id: 'e1',
          time: '2026-07-06T10:03:00.000Z',
          kind: 'deploy',
          title: '<img src=x onerror=alert(1)> deploy',
          source: 'github',
          tags: ['service:payments'],
        },
      ],
      metrics: [
        {
          query: 'avg:system.cpu.user{*}',
          metric: 'avg:system.cpu.user',
          scope: 'service:<b>payments</b>',
          unit: '%',
          points: [
            { time: '2026-07-06T10:00:00.000Z', value: 10 },
            { time: '2026-07-06T10:05:00.000Z', value: null },
            { time: '2026-07-06T10:10:00.000Z', value: 30 },
          ],
          stats: { min: 10, max: 30, avg: 20, last: 30 },
        },
      ],
      notices: ['Events unavailable: <403>'],
    }
  }

  it('renders an escaped events table with kind badges', () => {
    const html = generateReport(crossSourceResult(), new Map())
    expect(html).toContain('Events in window (1)')
    expect(html).toContain('event-badge deploy')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; deploy')
    expect(html).toContain('github')
  })

  it('renders a metrics section with escaped labels, stats, and a sparkline', () => {
    const html = generateReport(crossSourceResult(), new Map())
    expect(html).toContain('<h2>Metrics</h2>')
    expect(html).not.toContain('service:<b>payments</b>')
    expect(html).toContain('service:&lt;b&gt;payments&lt;/b&gt;')
    expect(html).toContain('min 10 · avg 20 · max 30 · last 30 %')
    expect(html).toContain('Metric sparkline')
  })

  it('renders escaped notices and event markers on the timeline SVG', () => {
    const html = generateReport(crossSourceResult(), new Map())
    expect(html).toContain('&lt;403&gt;')
    expect(html).not.toContain('<403>')
    expect(html).toContain('event-marker')
    expect(html).toContain('deploy event')
  })

  it('omits every cross-source section when the fields are absent', () => {
    const html = generateReport(fixtureResult(), new Map())
    expect(html).not.toContain('Events in window')
    expect(html).not.toContain('<h2>Metrics</h2>')
    expect(html).not.toContain('event-marker')
    expect(html).not.toContain('class="notices"')
  })

  it('shows a copyable trace chip on rows that carry a trace id', () => {
    const result = fixtureResult()
    result.rows[0].traceId = 'trace-<script>'
    const html = generateReport(result, new Map())
    expect(html).toContain('trace:trace-&lt;script&gt;')
    expect(html).not.toContain('trace-<script>')
  })
})

describe('renderTimelineSvg event markers', () => {
  const timeline = [
    { time: '2026-07-06T10:00:00.000Z', counts: { error: 5 } },
    { time: '2026-07-06T10:05:00.000Z', counts: { error: 3 } },
  ]

  it('renders a dashed line + triangle per in-range event with an escaped tooltip', () => {
    const svg = renderTimelineSvg(timeline, {
      endMs: Date.parse('2026-07-06T10:10:00Z'),
      events: [{ id: 'e1', time: '2026-07-06T10:05:00.000Z', kind: 'alert', title: '"quoted" & <alert>' }],
    })
    expect(svg).toContain('class="event-marker"')
    expect(svg).toContain('stroke-dasharray="3 3"')
    expect(svg).toContain('var(--event-alert)')
    expect(svg).toContain('&quot;quoted&quot; &amp; &lt;alert&gt;')
  })

  it('drops events outside the rendered bucket range', () => {
    const svg = renderTimelineSvg(timeline, {
      endMs: Date.parse('2026-07-06T10:10:00Z'),
      events: [{ id: 'e1', time: '2026-07-06T12:00:00.000Z', kind: 'deploy', title: 'late deploy' }],
    })
    expect(svg).not.toContain('event-marker')
  })

  it('positions markers by linear interpolation over the bucket span', () => {
    const svg = renderTimelineSvg(timeline, {
      width: 1000,
      endMs: Date.parse('2026-07-06T10:10:00Z'),
      events: [{ id: 'e1', time: '2026-07-06T10:05:00.000Z', kind: 'deploy', title: 'mid deploy' }],
    })
    // Domain 10:00–10:10, event at 10:05 → x = padLeft + plotW / 2 = 44 + 948/2 = 518.
    expect(svg).toContain('x1="518.0"')
  })
})

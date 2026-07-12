import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawSpan } from '../../datadog/normalize.js'

const { listTraceSpans } = vi.hoisted(() => ({ listTraceSpans: vi.fn() }))

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient: () => ({ listTraceSpans }),
}))

import { createServer } from '../../server.js'
import { formatTrace } from '../get-trace.js'

function span(overrides: NonNullable<RawSpan['attributes']>): RawSpan {
  return { id: overrides.spanId, attributes: overrides }
}

const base = '2026-07-06T10:00:00.000Z'
const at = (offsetMs: number) => new Date(new Date(base).getTime() + offsetMs).toISOString()

describe('datadog_get_trace', () => {
  beforeEach(() => {
    listTraceSpans.mockReset()
  })

  it('renders a parent/child tree with offsets, durations, and error markers', async () => {
    listTraceSpans.mockResolvedValue({
      truncated: false,
      spans: [
        span({
          spanId: 'root',
          service: 'web-store',
          resourceName: 'GET /checkout',
          type: 'web',
          startTimestamp: at(0),
          endTimestamp: at(1240),
        }),
        span({
          spanId: 'child',
          parentId: 'root',
          service: 'checkout-svc',
          resourceName: 'POST /charge',
          type: 'http',
          startTimestamp: at(12),
          endTimestamp: at(832),
          custom: { 'error.message': 'card declined' },
        }),
        span({
          spanId: 'grandchild',
          parentId: 'child',
          service: 'payments-svc',
          resourceName: 'stripe.charge',
          startTimestamp: at(15),
          endTimestamp: at(805),
          attributes: { error: 1 },
        }),
      ],
    })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 'abc123', from: 'now-1h', to: 'now' })

    expect(listTraceSpans).toHaveBeenCalledWith({ traceId: 'abc123', from: 'now-1h', to: 'now' })
    expect(result.content[0].text).toBe(
      [
        `Trace abc123 — 3 spans (2 errors), duration 1.24s, start ${base}`,
        'web-store GET /checkout [web] +<1ms 1.24s',
        '  checkout-svc POST /charge [http] +12ms 820ms [ERROR]',
        '    payments-svc stripe.charge [custom] +15ms 790ms [ERROR]',
      ].join('\n')
    )
  })

  it('renders orphan spans as roots with a missing-parent note', async () => {
    listTraceSpans.mockResolvedValue({
      truncated: false,
      spans: [
        span({
          spanId: 'root',
          service: 'web',
          resourceName: 'GET /',
          type: 'web',
          startTimestamp: at(0),
          endTimestamp: at(100),
        }),
        span({
          spanId: 'orphan',
          parentId: '9f3a2b',
          service: 'db-worker',
          resourceName: 'flush',
          type: 'db',
          startTimestamp: at(900),
          endTimestamp: at(920),
        }),
      ],
    })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 't1', from: 'now-1h', to: 'now' })

    const lines = result.content[0].text.split('\n')
    expect(lines[2]).toBe('db-worker flush [db] +900ms 20ms (parent 9f3a2b not fetched)')
  })

  it('renders all spans chronologically at depth 0 when the root is missing', async () => {
    listTraceSpans.mockResolvedValue({
      truncated: false,
      spans: [
        span({
          spanId: 'b',
          parentId: 'gone',
          service: 'svc',
          resourceName: 'second',
          startTimestamp: at(50),
          endTimestamp: at(60),
        }),
        span({
          spanId: 'a',
          parentId: 'gone',
          service: 'svc',
          resourceName: 'first',
          startTimestamp: at(0),
          endTimestamp: at(10),
        }),
      ],
    })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 't1', from: 'now-1h', to: 'now' })

    const lines = result.content[0].text.split('\n')
    expect(lines[1]).toBe('svc first [custom] +<1ms 10ms (parent gone not fetched)')
    expect(lines[2]).toBe('svc second [custom] +50ms 10ms (parent gone not fetched)')
  })

  it('caps rendered spans and reports the remainder', async () => {
    const spans = Array.from({ length: 305 }, (_, i) =>
      span({
        spanId: `s${i}`,
        service: 'svc',
        resourceName: `op-${i}`,
        startTimestamp: at(i),
        endTimestamp: at(i + 1),
      })
    )
    listTraceSpans.mockResolvedValue({ truncated: false, spans })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 't1', from: 'now-1h', to: 'now' })

    const text = result.content[0].text
    expect(text.split('\n')).toHaveLength(302) // header + 300 spans + overflow note
    expect(text.endsWith('(+5 more spans not shown)')).toBe(true)
  })

  it('notes when the fetch itself was capped', async () => {
    listTraceSpans.mockResolvedValue({
      truncated: true,
      spans: [span({ spanId: 'a', service: 'svc', resourceName: 'op', startTimestamp: at(0), endTimestamp: at(1) })],
    })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 't1', from: 'now-1h', to: 'now' })

    expect(result.content[0].text).toContain('fetch capped')
  })

  it('guides the model to widen the range when no spans are found', async () => {
    listTraceSpans.mockResolvedValue({ truncated: false, spans: [] })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 'missing', from: 'now-1h', to: 'now' })

    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('No spans found for trace_id "missing"')
    expect(result.content[0].text).toContain('Widen the range')
  })

  it('rejects timezone-less absolute timestamps before calling Datadog', async () => {
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_get_trace

    const result = await tool.handler({ trace_id: 't1', from: '2026-07-06T10:00:00', to: '2026-07-06T11:00:00' })

    expect(listTraceSpans).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('must include a time zone')
  })
})

describe('formatTrace', () => {
  it('does not hang or drop spans on parent cycles', () => {
    const spans = [
      span({
        spanId: 'a',
        parentId: 'b',
        service: 'svc',
        resourceName: 'a-op',
        startTimestamp: at(0),
        endTimestamp: at(1),
      }),
      span({
        spanId: 'b',
        parentId: 'a',
        service: 'svc',
        resourceName: 'b-op',
        startTimestamp: at(1),
        endTimestamp: at(2),
      }),
    ]

    const text = formatTrace('cycle', spans, false)

    expect(text).toContain('a-op')
    expect(text).toContain('b-op')
  })

  it('renders unknown timestamps as ? without crashing', () => {
    const text = formatTrace('t1', [span({ spanId: 'a', service: 'svc', resourceName: 'op' })], false)

    expect(text).toContain('duration ?')
    expect(text).toContain('svc op [custom] +? ?')
  })
})

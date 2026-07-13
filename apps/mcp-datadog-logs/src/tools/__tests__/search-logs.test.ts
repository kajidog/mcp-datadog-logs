import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawLog } from '../../datadog/normalize.js'

const { searchLogs } = vi.hoisted(() => ({ searchLogs: vi.fn() }))

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient: () => ({ searchLogs }),
}))

import { createServer } from '../../server.js'

function log(attributes: Record<string, unknown> | undefined): RawLog {
  return {
    id: 'log-1',
    attributes: {
      timestamp: '2026-07-11T09:20:14Z',
      status: 'error',
      service: 'web-store',
      message: 'Payment failed',
      attributes,
    },
  }
}

async function runSearch(logs: RawLog[], args: Record<string, unknown> = {}) {
  searchLogs.mockResolvedValue({ logs })
  const server = createServer()
  const tool = (server as any)._registeredTools.datadog_search_logs
  const result = await tool.handler({ query: '*', from: 'now-15m', to: 'now', limit: 20, sort: '-timestamp', ...args })
  return result.content[0].text.split('\n')[1] as string
}

describe('datadog_search_logs trace_id output', () => {
  beforeEach(() => {
    searchLogs.mockReset()
  })

  it('appends trace_id before the message when the log carries one', async () => {
    const line = await runSearch([log({ trace_id: '4711824721399429111' })])
    expect(line).toBe('2026-07-11T09:20:14.000Z [ERROR] web-store trace_id=4711824721399429111 — Payment failed')
  })

  it('omits trace_id when the log has none', async () => {
    const line = await runSearch([log({ other: 'x' })])
    expect(line).toBe('2026-07-11T09:20:14.000Z [ERROR] web-store — Payment failed')
  })

  it('resolves flattened dd.trace_id and nested dd objects, stringifying numbers', async () => {
    expect(await runSearch([log({ 'dd.trace_id': 'flat-id' })])).toContain('trace_id=flat-id')
    expect(await runSearch([log({ dd: { trace_id: 12345 } })])).toContain('trace_id=12345')
  })
})

describe('datadog_search_logs attributes parameter', () => {
  beforeEach(() => {
    searchLogs.mockReset()
  })

  it('appends requested attributes after the message, resolving flat keys before dot paths', async () => {
    const line = await runSearch([log({ 'http.status_code': 402, error: { kind: 'CardError' } })], {
      attributes: ['http.status_code', 'error.kind'],
    })
    expect(line).toBe(
      '2026-07-11T09:20:14.000Z [ERROR] web-store — Payment failed | http.status_code=402 error.kind=CardError'
    )
  })

  it('JSON-stringifies object values and truncates them', async () => {
    const line = await runSearch([log({ payload: { message: 'x'.repeat(200) } })], { attributes: ['payload'] })
    expect(line).toContain('| payload={"message":"xxx')
    expect(line).toContain('…')
  })

  it('silently skips missing attributes and omits the separator when none resolve', async () => {
    const line = await runSearch([log({ present: 'yes' })], { attributes: ['absent', 'present'] })
    expect(line).toBe('2026-07-11T09:20:14.000Z [ERROR] web-store — Payment failed | present=yes')

    const bare = await runSearch([log({})], { attributes: ['absent'] })
    expect(bare).toBe('2026-07-11T09:20:14.000Z [ERROR] web-store — Payment failed')
    expect(bare).not.toContain('|')
  })
})

describe('datadog_search_logs dedupe parameter', () => {
  beforeEach(() => {
    searchLogs.mockReset()
  })

  function logWithMessage(id: string, message: string): RawLog {
    return {
      id,
      attributes: {
        timestamp: '2026-07-11T09:20:14Z',
        status: 'error',
        service: 'web-store',
        message,
        attributes: {},
      },
    }
  }

  it('groups the fetched page into one line per message pattern', async () => {
    searchLogs.mockResolvedValue({
      logs: [
        logWithMessage('a', 'Payment failed for order 42'),
        logWithMessage('b', 'Payment failed for order 43'),
        logWithMessage('c', 'Cache miss'),
      ],
      nextCursor: 'page-2',
    })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_logs
    const result = await tool.handler(
      { query: '*', from: 'now-15m', to: 'now', limit: 20, sort: '-timestamp', dedupe: true },
      {}
    )

    const text = result.content[0].text
    const lines = text.split('\n')
    expect(lines[0]).toBe('3 logs in 2 patterns (query: *, range: now-15m → now)')
    expect(lines[1]).toBe(
      '2x Payment failed for order <*> — e.g. 2026-07-11T09:20:14.000Z web-store: Payment failed for order 42'
    )
    expect(lines[2]).toContain('1x Cache miss')
    expect(text).toContain('nextCursor: page-2')
  })

  it('keeps the per-log output unchanged when dedupe is off', async () => {
    const line = await runSearch([log({})], { dedupe: false })
    expect(line).toBe('2026-07-11T09:20:14.000Z [ERROR] web-store — Payment failed')
  })
})

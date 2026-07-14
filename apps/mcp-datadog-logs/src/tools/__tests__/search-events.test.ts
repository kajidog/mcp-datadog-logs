import { beforeEach, describe, expect, it, vi } from 'vitest'

const { searchEvents } = vi.hoisted(() => ({ searchEvents: vi.fn() }))

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient: () => ({ searchEvents }),
}))

import { createServer } from '../../server.js'

describe('datadog_search_events', () => {
  beforeEach(() => {
    searchEvents.mockReset()
  })

  it('formats deployment-style events with timestamp, status, source, title, and tags', async () => {
    searchEvents.mockResolvedValue([
      {
        id: 'e1',
        attributes: {
          timestamp: new Date('2026-07-11T09:12:00Z'),
          tags: ['service:web', 'env:prod'],
          attributes: {
            title: 'Deployed web-store v2.4.1 to prod',
            status: 'info',
            sourceTypeName: 'github',
          },
        },
      },
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: 'source:github tags:service:web', from: 'now-1d', to: 'now', limit: 25 })

    expect(searchEvents).toHaveBeenCalledWith({
      query: 'source:github tags:service:web',
      from: 'now-1d',
      to: 'now',
      limit: 25,
    })
    expect(result.content[0].text).toBe(
      [
        '1 events (query: source:github tags:service:web, range: now-1d → now)',
        '2026-07-11T09:12:00.000Z [info] github — Deployed web-store v2.4.1 to prod | tags: service:web, env:prod',
      ].join('\n')
    )
  })

  it('caps tags and truncates long titles', async () => {
    searchEvents.mockResolvedValue([
      {
        attributes: {
          timestamp: '2026-07-11T09:12:00Z',
          tags: Array.from({ length: 10 }, (_, i) => `tag:${i}`),
          attributes: { title: 't'.repeat(200), status: 'error' },
        },
      },
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: '*', from: 'now-1d', to: 'now', limit: 25 })

    const line = result.content[0].text.split('\n')[1]
    expect(line).toContain(`${'t'.repeat(160)}…`)
    expect(line).toContain('tag:7 (+2 more)')
    expect(line).not.toContain('tag:8')
  })

  it('hides tags entirely with max_tags: 0', async () => {
    searchEvents.mockResolvedValue([
      {
        attributes: {
          timestamp: '2026-07-11T09:12:00Z',
          tags: ['service:web', 'env:prod'],
          attributes: { title: 'Deploy', status: 'info', sourceTypeName: 'github' },
        },
      },
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: '*', from: 'now-1d', to: 'now', limit: 25, max_tags: 0 })

    const line = result.content[0].text.split('\n')[1]
    expect(line).toBe('2026-07-11T09:12:00.000Z [info] github — Deploy')
    expect(line).not.toContain('tags:')
  })

  it('falls back to the event message and collapses whitespace when there is no title', async () => {
    searchEvents.mockResolvedValue([
      { attributes: { timestamp: '2026-07-11T09:12:00Z', message: 'multi\n  line\tmessage' } },
      { attributes: { timestamp: '2026-07-11T09:13:00Z' } },
    ])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: '*', from: 'now-1d', to: 'now', limit: 25 })

    const lines = result.content[0].text.split('\n')
    expect(lines[1]).toBe('2026-07-11T09:12:00.000Z [info] multi line message')
    expect(lines[2]).toBe('2026-07-11T09:13:00.000Z [info] (no title)')
  })

  it('reports when no events matched', async () => {
    searchEvents.mockResolvedValue([])
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: 'source:github', from: 'now-1d', to: 'now', limit: 25 })

    expect(result.content[0].text).toBe('No events matched query "source:github" between now-1d and now.')
  })

  it('rejects timezone-less absolute timestamps before calling Datadog', async () => {
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: '*', from: '2026-07-06T10:00:00', to: '2026-07-06T11:00:00', limit: 25 })

    expect(searchEvents).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('must include a time zone')
  })

  it('names the events_read scope on 403 responses', async () => {
    searchEvents.mockRejectedValue({ code: 403, message: 'Forbidden' })
    const server = createServer()
    const tool = (server as any)._registeredTools.datadog_search_events

    const result = await tool.handler({ query: '*', from: 'now-1d', to: 'now', limit: 25 })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('events_read')
    expect(result.content[0].text).not.toContain('logs_read_data')
  })
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InvestigationResult } from '@kajidog/investigation-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawLog } from '../../datadog/normalize.js'
import { createServer } from '../../server.js'
import { clearSessions, setSession } from '../investigate/runtime.js'
import { fixtureResult, fixtureRow } from './fixtures.js'

const { getDatadogClient } = vi.hoisted(() => ({ getDatadogClient: vi.fn(() => ({})) }))

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient,
}))

const VIEW_UUID = '11111111-2222-3333-4444-555555555555'

function getHandler() {
  const server = createServer()
  const tools = (server as any)._registeredTools as Record<string, { handler: (args: any, extra: any) => any }>
  return (args: Record<string, unknown>) => tools.datadog_get_session_logs.handler(args, {})
}

function resultText(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content.map((c) => c.text ?? '').join('\n')
}

/**
 * Session with mixed statuses/services, two patterns, and raw logs carrying
 * custom attributes so list extras and detail fields can be exercised.
 */
function seedSession(resultOverrides: Partial<InvestigationResult> = {}): void {
  const result = fixtureResult({
    rows: [
      fixtureRow('log-0', { status: 'info', service: 'checkout', message: 'Request completed in 12ms' }),
      fixtureRow('log-1', { status: 'error', service: 'payments', message: 'Payment failed: upstream timeout (a)' }),
      fixtureRow('log-2', { status: 'warn', service: 'payments', message: 'Retrying charge for order 42' }),
      fixtureRow('log-3', { status: 'error', service: 'payments', message: 'Payment failed: upstream timeout (b)' }),
    ],
    patterns: [
      {
        template: 'Payment failed: upstream timeout <*>',
        count: 2,
        ratio: 0.5,
        example: 'Payment failed: upstream timeout (a)',
        rowIds: ['log-1', 'log-3'],
      },
      {
        template: 'Retrying charge for order <*>',
        count: 1,
        ratio: 0.25,
        example: 'Retrying charge for order 42',
        rowIds: ['log-2'],
      },
    ],
    ...resultOverrides,
  })
  const rawById = new Map<string, RawLog>(
    result.rows.map((row) => [
      row.id,
      {
        id: row.id,
        attributes: {
          timestamp: row.timestamp,
          status: row.status,
          service: row.service,
          message: row.message,
          attributes: { 'http.status_code': 502, error: { kind: 'Timeout', stack: `stack-${row.id}` } },
        },
      },
    ])
  )
  setSession(VIEW_UUID, { result, rawById, createdAt: 1, updatedAt: 1 })
}

beforeEach(() => {
  clearSessions()
  getDatadogClient.mockClear()
  vi.unstubAllEnvs()
  vi.stubEnv('MCP_DATADOG_SESSION_DIR', mkdtempSync(join(tmpdir(), 'dd-sessions-')))
})

describe('datadog_get_session_logs (list mode)', () => {
  it('returns isError with a re-run hint for a missing session', async () => {
    const res = await getHandler()({ viewUUID: VIEW_UUID })
    expect(res.isError).toBe(true)
    expect(resultText(res)).toContain('not found')
    expect(resultText(res)).toContain('datadog_run_investigation')
  })

  it('lists all stored rows with absolute [N] indexes and never calls Datadog', async () => {
    seedSession()
    const res = await getHandler()({ viewUUID: VIEW_UUID })
    expect(res.isError).toBeUndefined()
    const text = resultText(res)
    expect(text).toContain('4 of 4 stored rows match — showing 4 (offset 0)')
    expect(text).toContain('[0] 2026-07-06T10:01:00.000Z [INFO] checkout')
    expect(text).toContain('[3] 2026-07-06T10:01:00.000Z [ERROR] payments')
    expect(getDatadogClient).not.toHaveBeenCalled()
  })

  it('filters by status list', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, status: ['error', 'warn'] }))
    expect(text).toContain('3 of 4 stored rows match (status=error,warn)')
    expect(text).not.toContain('[0]')
    expect(text).toContain('[1]')
    expect(text).toContain('[2]')
    expect(text).toContain('[3]')
  })

  it('filters by exact service', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, service: 'checkout' }))
    expect(text).toContain('1 of 4 stored rows match (service=checkout)')
    expect(text).toContain('[0]')
  })

  it('filters by pattern number from the summary', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, pattern: 1 }))
    expect(text).toContain('2 of 4 stored rows match (pattern=#1)')
    expect(text).toContain('[1]')
    expect(text).toContain('[3]')
    expect(text).not.toContain('[2]')
  })

  it('rejects an out-of-range pattern number naming the pattern count', async () => {
    seedSession()
    const res = await getHandler()({ viewUUID: VIEW_UUID, pattern: 7 })
    expect(res.isError).toBe(true)
    expect(resultText(res)).toContain('pattern=#7 is out of range: this session has 2 patterns')
  })

  it('filters by case-insensitive message substring', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, contains: 'RETRYING' }))
    expect(text).toContain('1 of 4 stored rows match (contains="RETRYING")')
    expect(text).toContain('[2]')
  })

  it('pages with offset/limit, keeping absolute indexes and a next-offset footer', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, offset: 1, limit: 2 }))
    expect(text).toContain('4 of 4 stored rows match — showing 2 (offset 1)')
    expect(text).toContain('[1]')
    expect(text).toContain('[2]')
    expect(text).not.toContain('[3]')
    expect(text).toContain('Next: offset=3.')
  })

  it('appends requested attributes from the stored raw log', async () => {
    seedSession()
    const text = resultText(
      await getHandler()({ viewUUID: VIEW_UUID, limit: 1, attributes: ['http.status_code', 'missing.key'] })
    )
    expect(text).toContain('http.status_code=502')
    expect(text).not.toContain('missing.key')
  })

  it('reports zero matches without a row list', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, contains: 'no-such-text' }))
    expect(text).toBe('0 of 4 stored rows match (contains="no-such-text")')
  })
})

describe('datadog_get_session_logs (detail mode)', () => {
  it('returns the full raw log as JSON by row index', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, row: 1 }))
    expect(text).toContain('[1] 2026-07-06T10:01:00.000Z [ERROR] payments')
    expect(text).toContain('logId: log-1')
    expect(text).toContain('"http.status_code": 502')
    expect(getDatadogClient).not.toHaveBeenCalled()
  })

  it('returns the full raw log as JSON by logId', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, logId: 'log-2' }))
    expect(text).toContain('logId: log-2')
    expect(text).toContain('"stack-log-2"')
  })

  it('rejects an out-of-range row index', async () => {
    seedSession()
    const res = await getHandler()({ viewUUID: VIEW_UUID, row: 99 })
    expect(res.isError).toBe(true)
    expect(resultText(res)).toContain('row=99 is out of range')
  })

  it('rejects an unknown logId', async () => {
    seedSession()
    const res = await getHandler()({ viewUUID: VIEW_UUID, logId: 'nope' })
    expect(res.isError).toBe(true)
    expect(resultText(res)).toContain('not in this session')
  })

  it('returns selected fields instead of the full JSON', async () => {
    seedSession()
    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, row: 1, fields: ['error.stack', 'not.there'] }))
    expect(text).toContain('error.stack: stack-log-1')
    expect(text).toContain('not.there: (not set)')
    expect(text).not.toContain('"http.status_code"')
  })

  it('falls back to a truncated overview with a fields hint for large logs', async () => {
    seedSession()
    const result = fixtureResult({ rows: [fixtureRow('log-big', { message: 'huge payload' })] })
    const rawById = new Map<string, RawLog>([
      [
        'log-big',
        {
          id: 'log-big',
          attributes: {
            message: 'huge payload',
            attributes: { blob: 'x'.repeat(20_000), 'error.kind': 'Timeout' },
          },
        },
      ],
    ])
    setSession(VIEW_UUID, { result, rawById, createdAt: 1, updatedAt: 1 })

    const text = resultText(await getHandler()({ viewUUID: VIEW_UUID, row: 0 }))
    expect(text).toContain('Log is large')
    expect(text).toContain('Pass fields=')
    expect(text).toContain('error.kind: Timeout')
    expect(text.length).toBeLessThan(10_000)
  })
})

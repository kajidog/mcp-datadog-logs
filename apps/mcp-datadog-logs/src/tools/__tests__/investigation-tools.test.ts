import { VIEW_UUID_PATTERN } from '@kajidog/investigation-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runInvestigation } from '../../datadog/investigation.js'
import { createServer } from '../../server.js'
import { clearSessions, getSession, setSession } from '../investigate/runtime.js'
import { fixtureRawById, fixtureResult } from './fixtures.js'

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient: vi.fn(() => ({})),
}))
vi.mock('../../datadog/investigation.js', () => ({
  runInvestigation: vi.fn(),
}))

const runInvestigationMock = vi.mocked(runInvestigation)
const VIEW_UUID = '11111111-2222-3333-4444-555555555555'

function getHandler(name: string) {
  const server = createServer()
  const tools = (server as any)._registeredTools as Record<string, { handler: (args: any, extra: any) => any }>
  return (args: Record<string, unknown>) => tools[name].handler(args, {})
}

function seedSession(findings?: string): void {
  const result = fixtureResult()
  setSession(VIEW_UUID, {
    result,
    rawById: fixtureRawById(result),
    title: 'Seeded',
    findings,
    createdAt: 1,
    updatedAt: 1,
  })
}

function resultText(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content.map((c) => c.text ?? '').join('\n')
}

beforeEach(() => {
  clearSessions()
  runInvestigationMock.mockReset()
})

describe('datadog_investigate_logs with viewUUID', () => {
  it('displays an existing session without calling Datadog', async () => {
    seedSession('root cause note')
    const call = getHandler('datadog_investigate_logs')
    const res = await call({ query: '*', from: 'now-1h', to: 'now', viewUUID: VIEW_UUID })

    expect(res.isError).toBeUndefined()
    const text = resultText(res)
    expect(text.match(new RegExp(VIEW_UUID_PATTERN))?.[1]).toBe(VIEW_UUID)
    expect(runInvestigationMock).not.toHaveBeenCalled()
  })

  it('updates findings on the stored session when provided', async () => {
    seedSession('old note')
    const call = getHandler('datadog_investigate_logs')
    await call({ query: '*', from: 'now-1h', to: 'now', viewUUID: VIEW_UUID, findings: 'new note' })
    expect(getSession(VIEW_UUID)?.findings).toBe('new note')
  })

  it('returns isError for a missing/expired session instead of re-fetching', async () => {
    const call = getHandler('datadog_investigate_logs')
    const res = await call({ query: '*', from: 'now-1h', to: 'now', viewUUID: VIEW_UUID })
    expect(res.isError).toBe(true)
    expect(resultText(res)).toContain('not found')
    expect(runInvestigationMock).not.toHaveBeenCalled()
  })
})

describe('datadog_run_investigation', () => {
  it('stores the full result and returns only a compact summary with a viewUUID', async () => {
    const result = fixtureResult()
    runInvestigationMock.mockResolvedValueOnce({ result, rawById: fixtureRawById(result) })

    const call = getHandler('datadog_run_investigation')
    const res = await call({ query: 'status:error', from: 'now-1h', to: 'now', sampleRows: 2 })

    const text = resultText(res)
    const uuid = text.match(new RegExp(VIEW_UUID_PATTERN))?.[1]
    expect(uuid).toBeDefined()
    expect(getSession(uuid as string)?.result.rows).toHaveLength(4)
    expect(text).toContain('Sample logs (2 of 4 stored):')
    expect(text).toContain('datadog_investigate_logs')
    // compact: the summary must not inline all stored rows
    expect(text).not.toContain('log-3')
  })

  it('rejects cursor without viewUUID', async () => {
    const call = getHandler('datadog_run_investigation')
    const res = await call({ query: '*', from: 'now-1h', to: 'now', sampleRows: 3, cursor: 'page-2' })
    expect(res.isError).toBe(true)
    expect(runInvestigationMock).not.toHaveBeenCalled()
  })
})

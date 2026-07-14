import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runInvestigation } from '../../datadog/investigation.js'
import { clearSessions, getSession } from '../investigate/runtime.js'
import { runAndStoreInvestigation, sessionResult } from '../investigate/session-ops.js'
import { fixtureRawById, fixtureResult, fixtureRow } from './fixtures.js'

vi.mock('../../datadog/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/client.js')>()),
  getDatadogClient: vi.fn(() => ({})),
}))
vi.mock('../../datadog/investigation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../datadog/investigation.js')>()),
  runInvestigation: vi.fn(),
}))

const runInvestigationMock = vi.mocked(runInvestigation)

function mockRun(resultOverrides: Parameters<typeof fixtureResult>[0] = {}) {
  const result = fixtureResult(resultOverrides)
  runInvestigationMock.mockResolvedValueOnce({ result, rawById: fixtureRawById(result) })
  return result
}

describe('runAndStoreInvestigation', () => {
  beforeEach(() => {
    clearSessions()
    runInvestigationMock.mockReset()
  })

  it('creates a new session with a fresh viewUUID', async () => {
    mockRun()
    const { viewUUID, session } = await runAndStoreInvestigation({
      params: { query: '*', from: 'now-1h', to: 'now' },
      findings: 'initial note',
    })
    expect(viewUUID).toMatch(/^[0-9a-fA-F-]{36}$/)
    expect(getSession(viewUUID)).toBe(session)
    expect(session.findings).toBe('initial note')
    expect(session.result.rows).toHaveLength(4)
  })

  it('updates an existing session, preserving createdAt/title/findings when not passed', async () => {
    mockRun()
    const first = await runAndStoreInvestigation({
      params: { query: '*', from: 'now-1h', to: 'now', title: 'Checkout errors' },
      findings: 'keep me',
    })

    mockRun()
    const second = await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { query: 'status:error', from: 'now-1h', to: 'now' },
    })
    expect(second.viewUUID).toBe(first.viewUUID)
    expect(second.session.createdAt).toBe(first.session.createdAt)
    expect(second.session.title).toBe('Checkout errors')
    expect(second.session.findings).toBe('keep me')

    mockRun()
    const third = await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { query: 'status:error', from: 'now-1h', to: 'now' },
      findings: 'replaced',
    })
    expect(third.session.findings).toBe('replaced')
  })

  it('merges cursor pages without duplicate rows and unions rawById', async () => {
    mockRun()
    const first = await runAndStoreInvestigation({ params: { query: '*', from: 'now-1h', to: 'now' } })
    expect(first.session.result.rows.map((r) => r.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4'])

    mockRun({ rows: [fixtureRow('log-4'), fixtureRow('log-5')] })
    const second = await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { query: '*', from: 'now-1h', to: 'now', cursor: 'page-2' },
    })
    expect(second.session.result.rows.map((r) => r.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4', 'log-5'])
    expect([...second.session.rawById.keys()].sort()).toEqual(['log-1', 'log-2', 'log-3', 'log-4', 'log-5'])
  })

  it('inherits stored parameters and freezes the resolved range for a cursor continuation', async () => {
    mockRun({
      params: { query: 'service:checkout', from: 'now-7d', to: 'now', groupBy: '@env', limit: 50 },
    })
    const first = await runAndStoreInvestigation({
      params: { query: 'service:checkout', from: 'now-7d', to: 'now', groupBy: '@env', limit: 50 },
    })

    mockRun({
      params: { query: 'service:checkout', from: 'now-7d', to: 'now', groupBy: '@env', limit: 50 },
      rows: [fixtureRow('log-5')],
    })
    await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { cursor: 'page-2' },
    })

    expect(runInvestigationMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: 'service:checkout',
        from: '2026-07-06T09:10:00.000Z',
        to: '2026-07-06T10:10:00.000Z',
        groupBy: '@env',
        limit: 50,
        cursor: 'page-2',
      })
    )
  })

  it('extracts message patterns over all rows, recomputing after a cursor merge', async () => {
    mockRun()
    const first = await runAndStoreInvestigation({ params: { query: '*', from: 'now-1h', to: 'now' } })
    expect(first.session.result.patterns).toBeDefined()
    const firstTotal = (first.session.result.patterns ?? []).reduce((sum, p) => sum + p.count, 0)
    expect(firstTotal).toBe(4)

    mockRun({ rows: [fixtureRow('log-5'), fixtureRow('log-6')] })
    const second = await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { query: '*', from: 'now-1h', to: 'now', cursor: 'page-2' },
    })
    const secondTotal = (second.session.result.patterns ?? []).reduce((sum, p) => sum + p.count, 0)
    expect(secondTotal).toBe(6)
    const allRowIds = (second.session.result.patterns ?? []).flatMap((p) => p.rowIds).sort()
    expect(allRowIds).toEqual(['log-1', 'log-2', 'log-3', 'log-4', 'log-5', 'log-6'])
  })

  it('carries events, metrics, and notices forward across a cursor merge', async () => {
    const events = [{ id: 'e1', time: '2026-07-06T10:00:00.000Z', kind: 'deploy' as const, title: 'Deploy v2' }]
    const metrics = [
      {
        query: 'avg:system.cpu.user{*}',
        metric: 'avg:system.cpu.user',
        points: [{ time: '2026-07-06T10:00:00.000Z', value: 10 }],
        stats: { min: 10, max: 10, avg: 10, last: 10 },
      },
    ]
    mockRun({ events, metrics, notices: ['Events partially fetched'] })
    const first = await runAndStoreInvestigation({ params: { query: '*', from: 'now-1h', to: 'now' } })

    // The pipeline skips events/metrics on cursor pages, so the page-2 result has none.
    mockRun({ rows: [fixtureRow('log-5')] })
    const second = await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { cursor: 'page-2' },
    })
    expect(second.session.result.events).toEqual(events)
    expect(second.session.result.metrics).toEqual(metrics)
    expect(second.session.result.notices).toEqual(['Events partially fetched'])
  })

  it('inherits cross-source params from the stored session on re-runs', async () => {
    mockRun({
      params: {
        query: '*',
        from: 'now-1h',
        to: 'now',
        metricsQueries: ['avg:system.cpu.user{*}'],
        eventsQuery: 'source:github',
      },
    })
    const first = await runAndStoreInvestigation({
      params: {
        query: '*',
        from: 'now-1h',
        to: 'now',
        metricsQueries: ['avg:system.cpu.user{*}'],
        eventsQuery: 'source:github',
      },
    })

    // A plain UI re-run (no cursor) passes only query/range — the stored
    // metricsQueries/eventsQuery must survive.
    mockRun()
    await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { query: 'status:error', from: 'now-1h', to: 'now' },
    })
    expect(runInvestigationMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: 'status:error',
        metricsQueries: ['avg:system.cpu.user{*}'],
        eventsQuery: 'source:github',
      })
    )
  })

  it('recomputes trace candidates over all rows after a cursor merge', async () => {
    mockRun({ rows: [fixtureRow('log-1', { traceId: 'trace-a' })] })
    const first = await runAndStoreInvestigation({ params: { query: '*', from: 'now-1h', to: 'now' } })
    expect(first.session.result.traceCandidates?.map((c) => c.traceId)).toEqual(['trace-a'])

    mockRun({ rows: [fixtureRow('log-2', { traceId: 'trace-b' }), fixtureRow('log-3', { traceId: 'trace-b' })] })
    const second = await runAndStoreInvestigation({
      viewUUID: first.viewUUID,
      params: { cursor: 'page-2' },
    })
    expect(second.session.result.traceCandidates?.map((c) => c.traceId)).toEqual(['trace-b', 'trace-a'])
  })

  it('recreates a session for an evicted viewUUID, keeping the handle stable', async () => {
    mockRun()
    const { viewUUID, session } = await runAndStoreInvestigation({
      viewUUID: '11111111-2222-3333-4444-555555555555',
      params: { query: '*', from: 'now-1h', to: 'now' },
    })
    expect(viewUUID).toBe('11111111-2222-3333-4444-555555555555')
    expect(getSession(viewUUID)).toBe(session)
  })
})

describe('sessionResult', () => {
  beforeEach(() => {
    clearSessions()
    runInvestigationMock.mockReset()
  })

  it('stitches findings into the result and omits them when absent', async () => {
    mockRun()
    const withFindings = await runAndStoreInvestigation({
      params: { query: '*', from: 'now-1h', to: 'now' },
      findings: 'root cause: pool exhaustion',
    })
    expect(sessionResult(withFindings.session).findings).toBe('root cause: pool exhaustion')

    mockRun()
    const without = await runAndStoreInvestigation({ params: { query: '*', from: 'now-1h', to: 'now' } })
    expect(sessionResult(without.session).findings).toBeUndefined()
    expect(sessionResult(without.session)).toBe(without.session.result)
  })
})

import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestigationSession } from '../investigate/runtime.js'
import { clearSessions, getSession, setSession } from '../investigate/runtime.js'
import { fixtureRawById, fixtureResult } from './fixtures.js'

const VIEW_UUID = '11111111-2222-3333-4444-555555555555'
const OTHER_UUID = '99999999-8888-7777-6666-555555555555'

function fixtureSession(): InvestigationSession {
  const result = fixtureResult()
  return {
    result,
    rawById: fixtureRawById(result),
    title: 'Persisted',
    findings: 'root cause note',
    createdAt: 1,
    updatedAt: 2,
  }
}

let dir: string

beforeEach(() => {
  clearSessions()
  dir = mkdtempSync(join(tmpdir(), 'dd-sessions-'))
  vi.stubEnv('MCP_DATADOG_SESSION_DIR', dir)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('session persistence', () => {
  it('restores a session from disk after the in-memory store is cleared', () => {
    setSession(VIEW_UUID, fixtureSession())
    clearSessions()

    const restored = getSession(VIEW_UUID)
    expect(restored).toBeDefined()
    expect(restored?.title).toBe('Persisted')
    expect(restored?.findings).toBe('root cause note')
    expect(restored?.result.rows.map((r) => r.id)).toEqual(['log-1', 'log-2', 'log-3', 'log-4'])
    // rawById round-trips through the flattened rawLogs array
    expect(restored?.rawById.get('log-2')).toEqual({ id: 'log-2' })
  })

  it('returns undefined for corrupt files and schema version mismatches', () => {
    writeFileSync(join(dir, `${VIEW_UUID}.json`), 'not json{', 'utf-8')
    expect(getSession(VIEW_UUID)).toBeUndefined()

    setSession(OTHER_UUID, fixtureSession())
    const path = join(dir, `${OTHER_UUID}.json`)
    const file = JSON.parse(readFileSync(path, 'utf-8'))
    writeFileSync(path, JSON.stringify({ ...file, version: 999 }), 'utf-8')
    clearSessions()
    expect(getSession(OTHER_UUID)).toBeUndefined()
  })

  it('does nothing when persistence is disabled', () => {
    vi.stubEnv('MCP_DATADOG_PERSIST_SESSIONS', 'false')
    setSession(VIEW_UUID, fixtureSession())
    expect(readdirSync(dir)).toEqual([])
    clearSessions()
    expect(getSession(VIEW_UUID)).toBeUndefined()
  })

  it('survives an unwritable session directory without throwing', () => {
    vi.stubEnv('MCP_DATADOG_SESSION_DIR', join(dir, 'file-in-the-way'))
    writeFileSync(join(dir, 'file-in-the-way'), '', 'utf-8')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => setSession(VIEW_UUID, fixtureSession())).not.toThrow()
    } finally {
      errorSpy.mockRestore()
    }
    // Still served from memory even though the disk mirror failed.
    expect(getSession(VIEW_UUID)).toBeDefined()
  })

  it('prunes files older than the TTL on write', () => {
    setSession(VIEW_UUID, fixtureSession())
    const stalePath = join(dir, `${VIEW_UUID}.json`)
    const staleTime = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(stalePath, staleTime, staleTime)

    setSession(OTHER_UUID, fixtureSession())
    const names = readdirSync(dir)
    expect(names).toContain(`${OTHER_UUID}.json`)
    expect(names).not.toContain(`${VIEW_UUID}.json`)
  })

  it('ignores viewUUIDs that are not plain uuid file names', () => {
    expect(getSession('../escape')).toBeUndefined()
  })
})

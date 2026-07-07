import { afterEach, describe, expect, it, vi } from 'vitest'
import { getServerConfig } from '../config.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getServerConfig timeZone', () => {
  it('defaults to UTC when MCP_DATADOG_TIMEZONE is unset', () => {
    expect(getServerConfig({}).timeZone).toBe('UTC')
  })

  it('accepts a valid IANA time zone', () => {
    expect(getServerConfig({ MCP_DATADOG_TIMEZONE: 'Asia/Tokyo' }).timeZone).toBe('Asia/Tokyo')
  })

  it('falls back to UTC and warns on stderr for an invalid time zone', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(getServerConfig({ MCP_DATADOG_TIMEZONE: 'Mars/Olympus' }).timeZone).toBe('UTC')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Mars/Olympus'))
  })
})

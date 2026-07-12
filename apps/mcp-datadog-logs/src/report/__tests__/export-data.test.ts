import { describe, expect, it } from 'vitest'
import { fixtureResult, fixtureRow } from '../../tools/__tests__/fixtures.js'
import { investigationToCsv, investigationToJson } from '../export-data.js'

describe('investigationToCsv', () => {
  it('starts with a BOM and the header row', () => {
    const csv = investigationToCsv(fixtureResult({ rows: [] }))
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv.slice(1).split('\r\n')[0]).toBe('id,timestamp,status,service,host,message,tags')
  })

  it('quotes fields with commas, quotes and newlines per RFC 4180 and joins tags with ";"', () => {
    const csv = investigationToCsv(
      fixtureResult({
        rows: [
          fixtureRow('log-1', { message: 'a "quoted", multi\nline', tags: ['env:prod', 'team:a,b'] }),
          fixtureRow('log-2', { service: undefined, host: undefined, message: 'plain' }),
        ],
      })
    )
    const body = csv.slice(1)
    expect(body).toContain('"a ""quoted"", multi\nline"')
    expect(body).toContain('"env:prod;team:a,b"')
    expect(body).toContain('log-2,2026-07-06T10:01:00.000Z,error,,,plain,')
  })

  it('neutralizes spreadsheet formula triggers with a leading apostrophe', () => {
    const csv = investigationToCsv(
      fixtureResult({
        rows: [
          fixtureRow('log-1', { message: '=HYPERLINK("http://evil.example")', tags: ['+sum', '@cmd'] }),
          fixtureRow('log-2', { message: '-2+3', service: 'safe-service' }),
        ],
      })
    )
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`)
    expect(csv).not.toContain(',=HYPERLINK')
    expect(csv).toContain(`'+sum;@cmd`)
    expect(csv).toContain(`,'-2+3,`)
    // Values merely containing (not starting with) a trigger stay untouched
    expect(csv).toContain(',safe-service,')
  })

  it('exports only the given row subset', () => {
    const result = fixtureResult()
    const csv = investigationToCsv(result, { rows: result.rows.slice(0, 1) })
    expect(csv).toContain('log-1')
    expect(csv).not.toContain('log-2')
  })
})

describe('investigationToJson', () => {
  it('wraps rows in a meta envelope', () => {
    const result = fixtureResult({ findings: 'root cause' })
    const parsed = JSON.parse(investigationToJson(result, { title: 'My report' }))
    expect(parsed.meta).toMatchObject({
      title: 'My report',
      query: 'service:payments status:error',
      from: 'now-1h',
      to: 'now',
      totalCount: 1234,
      rowCount: 4,
      findings: 'root cause',
    })
    expect(parsed.meta.generatedAt).toBeDefined()
    expect(parsed.rows).toHaveLength(4)
    expect(parsed.rows[0].id).toBe('log-1')
  })

  it('includes patterns without rowIds and omits empty optionals', () => {
    const withPatterns = JSON.parse(
      investigationToJson(
        fixtureResult({
          patterns: [{ template: 'boom <*>', count: 2, ratio: 0.5, example: 'boom 1', rowIds: ['log-1', 'log-2'] }],
        })
      )
    )
    expect(withPatterns.meta.patterns).toEqual([{ template: 'boom <*>', count: 2, ratio: 0.5, example: 'boom 1' }])

    const bare = JSON.parse(investigationToJson(fixtureResult()))
    expect(bare.meta.patterns).toBeUndefined()
    expect(bare.meta.title).toBeUndefined()
    expect(bare.meta.findings).toBeUndefined()
  })
})

import { VIEW_UUID_PATTERN } from '@kajidog/investigation-shared'
import { describe, expect, it } from 'vitest'
import { formatInvestigationSummary } from '../investigate/summary.js'
import { fixtureResult, fixtureRow } from './fixtures.js'

const VIEW_UUID = '11111111-2222-3333-4444-555555555555'

describe('formatInvestigationSummary', () => {
  it('starts with the viewUUID contract line', () => {
    const summary = formatInvestigationSummary(fixtureResult(), VIEW_UUID)
    const [first] = summary.split('\n')
    const match = first.match(new RegExp(VIEW_UUID_PATTERN))
    expect(match?.[1]).toBe(VIEW_UUID)
  })

  it('includes totals, status counts and top facet values', () => {
    const summary = formatInvestigationSummary(fixtureResult(), VIEW_UUID)
    expect(summary).toContain('Query: service:payments status:error | Range: now-1h → now')
    expect(summary).toContain('Total: ~1,234 logs — error: 120, warn: 90, info: 980')
    expect(summary).toContain('service: payments (400), checkout (330), auth (260) +1 more, (other) 42')
    expect(summary).toContain('host: i-0a1b2c (500)')
  })

  it('inlines sample rows with collapsed whitespace and honors sampleRows: 0', () => {
    const result = fixtureResult({
      rows: [fixtureRow('log-1', { message: 'line one\n  line two\ttabbed' }), fixtureRow('log-2')],
    })
    const withSamples = formatInvestigationSummary(result, VIEW_UUID, { sampleRows: 1 })
    expect(withSamples).toContain('Sample logs (1 of 2 stored):')
    expect(withSamples).toContain('line one line two tabbed')
    expect(withSamples).not.toContain('log-2)')

    const noSamples = formatInvestigationSummary(result, VIEW_UUID, { sampleRows: 0 })
    expect(noSamples).not.toContain('Sample logs')
    expect(noSamples).toContain('2 log rows stored in the session.')
  })

  it('truncates long sample messages', () => {
    const result = fixtureResult({ rows: [fixtureRow('log-1', { message: 'x'.repeat(400) })] })
    const summary = formatInvestigationSummary(result, VIEW_UUID, { sampleRows: 1 })
    expect(summary).toContain(`${'x'.repeat(200)}…`)
    expect(summary).not.toContain('x'.repeat(201))
  })

  it('lists top patterns without rowIds and honors topPatterns: 0', () => {
    const result = fixtureResult({
      patterns: [
        {
          template: 'Payment failed for <*>',
          count: 3,
          ratio: 0.75,
          example: 'Payment failed for A',
          rowIds: ['log-1'],
        },
        { template: `Cache ${'y'.repeat(200)}`, count: 1, ratio: 0.25, example: 'Cache …', rowIds: ['log-4'] },
      ],
    })
    const summary = formatInvestigationSummary(result, VIEW_UUID, { topPatterns: 5 })
    expect(summary).toContain('Top patterns (of 4 fetched rows):')
    expect(summary).toContain('3 (75%) Payment failed for <*>')
    expect(summary).toContain(`Cache ${'y'.repeat(114)}…`)
    expect(summary).not.toContain('rowIds')
    expect(summary).not.toContain('y'.repeat(115))

    const capped = formatInvestigationSummary(result, VIEW_UUID, { topPatterns: 1 })
    expect(capped).toContain('Top patterns (of 4 fetched rows) +1 more:')
    expect(capped).not.toContain('Cache')

    expect(formatInvestigationSummary(result, VIEW_UUID, { topPatterns: 0 })).not.toContain('Top patterns')
    expect(formatInvestigationSummary(fixtureResult(), VIEW_UUID)).not.toContain('Top patterns')
  })

  it('appends nextCursor only when present', () => {
    expect(formatInvestigationSummary(fixtureResult(), VIEW_UUID)).not.toContain('nextCursor:')
    expect(formatInvestigationSummary(fixtureResult({ nextCursor: 'abc123' }), VIEW_UUID)).toContain(
      'nextCursor: abc123'
    )
  })
})

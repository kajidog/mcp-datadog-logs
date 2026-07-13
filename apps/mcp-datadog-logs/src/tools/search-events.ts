import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getDatadogClient } from '../datadog/client.js'
import type { RawEvent } from '../datadog/normalize.js'
import { toIso } from '../datadog/normalize.js'
import { resolveRange } from '../datadog/time.js'
import { registerPrefixedTool } from './registration.js'
import { createErrorResponse, textResult } from './utils.js'

const MAX_TITLE_LENGTH = 160
const MAX_TAGS = 8
const MAX_TAG_LENGTH = 60

export function formatEventLine(event: RawEvent, maxTags = MAX_TAGS): string {
  const attrs = event.attributes
  const inner = attrs?.attributes
  const rawTitle = inner?.title ?? attrs?.message ?? ''
  const title = rawTitle.replace(/\s+/g, ' ').trim() || '(no title)'
  const truncatedTitle = title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH)}…` : title
  const source = inner?.sourceTypeName
  const parts = [
    toIso(attrs?.timestamp) || '(no timestamp)',
    `[${inner?.status ?? 'info'}]`,
    source ? `${source} —` : undefined,
    truncatedTitle,
  ]
  const tags = attrs?.tags ?? []
  if (tags.length > 0 && maxTags > 0) {
    const shown = tags
      .slice(0, maxTags)
      .map((tag) => (tag.length > MAX_TAG_LENGTH ? `${tag.slice(0, MAX_TAG_LENGTH)}…` : tag))
    const more = tags.length > maxTags ? ` (+${tags.length - maxTags} more)` : ''
    parts.push(`| tags: ${shown.join(', ')}${more}`)
  }
  return parts.filter(Boolean).join(' ')
}

export function registerSearchEventsTool(server: McpServer): void {
  registerPrefixedTool(
    server,
    'search_events',
    {
      title: 'Search Datadog Events',
      description:
        'Search Datadog events (deployments, monitor alerts, config changes, custom events) and return them as ' +
        'compact chronological text. Use it to correlate an error window found in logs with what changed: e.g. ' +
        'query "source:github tags:service:web" for deployment events around the incident, or "source:alert" for ' +
        'monitor transitions. Supports Datadog events search syntax.',
      inputSchema: {
        query: z
          .string()
          .default('*')
          .describe('Datadog events search query, e.g. "source:github tags:service:web" for deployments of a service'),
        from: z
          .string()
          .default('now-1d')
          .describe('Start time: Datadog time math ("now-1d") or ISO 8601 with a time zone (Z or offset)'),
        to: z
          .string()
          .default('now')
          .describe('End time: Datadog time math ("now") or ISO 8601 with a time zone (Z or offset)'),
        limit: z.number().int().min(1).max(100).default(25).describe('Max events to return'),
        max_tags: z
          .number()
          .int()
          .min(0)
          .max(20)
          .default(8)
          .describe('Max tags per event line; 0 hides tags for a pure timeline'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({
      query,
      from,
      to,
      limit,
      max_tags,
    }: {
      query: string
      from: string
      to: string
      limit: number
      max_tags: number
    }): Promise<CallToolResult> => {
      try {
        resolveRange(from, to)
        const client = getDatadogClient()
        const events = await client.searchEvents({ query, from, to, limit })
        if (events.length === 0) {
          return textResult(`No events matched query "${query}" between ${from} and ${to}.`)
        }
        const header = `${events.length} events (query: ${query}, range: ${from} → ${to})`
        return textResult(`${header}\n${events.map((event) => formatEventLine(event, max_tags)).join('\n')}`)
      } catch (error) {
        return createErrorResponse(error, 'events_read')
      }
    }
  )
}

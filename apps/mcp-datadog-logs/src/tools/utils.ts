import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { describeDatadogError } from '../datadog/client.js'

/**
 * Schema for string-list params that LLM callers sometimes send as a
 * comma-separated string ("a,b,c") instead of a JSON array. Accepts both
 * shapes; handlers normalize with toStringList().
 */
export function stringListParam(maxItems?: number) {
  const array = z.array(z.string().min(1))
  return z.union([maxItems === undefined ? array : array.max(maxItems), z.string().min(1)])
}

/** Normalizes a stringListParam value: splits comma-separated strings, trims, drops empties. */
export function toStringList(value: string[] | string | undefined, maxItems?: number): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  const items = (Array.isArray(value) ? value : value.split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const limited = maxItems === undefined ? items : items.slice(0, maxItems)
  return limited.length > 0 ? limited : undefined
}

export function createErrorResponse(error: unknown, requiredScope?: string): CallToolResult {
  return {
    content: [{ type: 'text', text: describeDatadogError(error, requiredScope) }],
    isError: true,
  }
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

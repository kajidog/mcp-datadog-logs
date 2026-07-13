import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { describeDatadogError } from '../datadog/client.js'

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

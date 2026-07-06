import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * Tool name prefix for public-facing tools.
 * Internal app-only tools (starting with '_') are not prefixed.
 */
export const TOOL_PREFIX = 'datadog_'

export function addToolPrefix(name: string): string {
  if (name.startsWith('_')) {
    return name
  }
  return `${TOOL_PREFIX}${name}`
}

/**
 * Register a plain (non-UI) tool with an auto-prefixed name.
 * Rest args forward all overload variants of McpServer.registerTool.
 */
export function registerPrefixedTool(server: McpServer, name: string, ...args: [config: any, cb: any]) {
  server.registerTool(addToolPrefix(name), ...args)
}

/**
 * Register a UI-linked tool (config must carry _meta.ui) with an
 * auto-prefixed name via ext-apps' registerAppTool.
 */
export function registerPrefixedAppTool(server: McpServer, name: string, ...args: [config: any, cb: any]) {
  registerAppTool(server, addToolPrefix(name), ...args)
}

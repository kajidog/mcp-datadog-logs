#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { VERSION } from './version.js'

const HELP = `mcp-datadog-logs v${VERSION}
MCP server (stdio) for investigating Datadog logs with an interactive UI.

Usage:
  npx @kajidog/mcp-datadog-logs

Environment variables:
  DD_API_KEY               Datadog API key (required)
  DD_APP_KEY               Datadog application key with logs_read_data scope (required)
  DD_SITE                  Datadog site (default: datadoghq.com; e.g. ap1.datadoghq.com, datadoghq.eu)
  DD_LOGS_INDEXES          Comma-separated log indexes to search (default: all)
  MCP_DATADOG_EXPORT_DIR   Directory for exported HTML reports (default: ~/Downloads or cwd)
  MCP_DATADOG_MAX_ROWS     Max log rows per investigation (default: 200, max: 500)
  MCP_DATADOG_TIMEZONE     IANA time zone for report timestamps (default: UTC; e.g. Asia/Tokyo)

Options:
  --help      Show this help
  --version   Show version
`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION)
    return
  }

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout is the MCP channel — all logging must go to stderr.
  console.error(`mcp-datadog-logs v${VERSION} running on stdio`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAggregateLogsTool } from './tools/aggregate-logs.js'
import { registerInvestigateAppTools } from './tools/investigate/app-tools.js'
import { registerInvestigateTool } from './tools/investigate/investigate-tool.js'
import { registerInvestigatorResource } from './tools/investigate/resource.js'
import { registerSearchLogsTool } from './tools/search-logs.js'
import { VERSION } from './version.js'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'mcp-datadog-logs',
    version: VERSION,
    description: 'Investigate Datadog logs with an interactive MCP Apps UI and shareable HTML reports',
  })

  registerInvestigatorResource(server)
  registerSearchLogsTool(server)
  registerAggregateLogsTool(server)
  registerInvestigateTool(server)
  registerInvestigateAppTools(server)

  return server
}

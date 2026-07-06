import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { investigatorResourceUri } from './runtime.js'

const __dirname =
  typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url))

function loadInvestigatorHtml(): string {
  try {
    // Production build: HTML is copied next to the bundle by tsup onSuccess.
    return readFileSync(join(__dirname, 'mcp-app.html'), 'utf-8')
  } catch {
    try {
      // Dev (tsx): read the investigator-ui build output from node_modules.
      const htmlPath = join(
        __dirname,
        '..',
        '..',
        '..',
        'node_modules',
        '@kajidog',
        'investigator-ui',
        'dist',
        'mcp-app.html'
      )
      return readFileSync(htmlPath, 'utf-8')
    } catch {
      console.error('Warning: investigator-ui HTML not found. Build @kajidog/investigator-ui first.')
      return '<html><body><p>Investigator UI not available. Please build @kajidog/investigator-ui.</p></body></html>'
    }
  }
}

const investigatorHtml = loadInvestigatorHtml()

export function registerInvestigatorResource(server: McpServer): void {
  registerAppResource(
    server,
    'Datadog Logs Investigator',
    investigatorResourceUri,
    {
      description: 'Interactive UI for investigating Datadog logs',
      mimeType: RESOURCE_MIME_TYPE,
    },
    async (): Promise<ReadResourceResult> => ({
      contents: [
        {
          uri: investigatorResourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: investigatorHtml,
          _meta: {
            ui: {
              csp: {},
            },
          },
        },
      ],
    })
  )
}

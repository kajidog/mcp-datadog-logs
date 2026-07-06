import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  target: 'node20',
  noExternal: ['@kajidog/investigation-shared'],
  external: ['@datadog/datadog-api-client', '@modelcontextprotocol/ext-apps', '@modelcontextprotocol/sdk', 'zod'],
  onSuccess: async () => {
    const src = join('..', '..', 'packages', 'investigator-ui', 'dist', 'mcp-app.html')
    const dest = join('dist', 'mcp-app.html')
    try {
      cpSync(src, dest)
      console.log('Copied investigator-ui HTML to dist/mcp-app.html')
    } catch {
      console.warn('Warning: investigator-ui HTML not found. Build @kajidog/investigator-ui first.')
    }
  },
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Session persistence writes to the real cache dir by default — point every
// test worker at its own throwaway directory instead.
process.env.MCP_DATADOG_SESSION_DIR = mkdtempSync(join(tmpdir(), 'mcp-datadog-test-sessions-'))

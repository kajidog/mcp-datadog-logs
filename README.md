# mcp-datadog-logs monorepo

MCP server for investigating Datadog logs with an interactive MCP Apps UI and
shareable self-contained HTML reports.

📦 Published package: [`@kajidog/mcp-datadog-logs`](./apps/mcp-datadog-logs) — see its README for usage.

## Packages

| Package | Path | Published |
|---|---|---|
| `@kajidog/mcp-datadog-logs` | `apps/mcp-datadog-logs` | ✅ npm |
| `@kajidog/investigator-ui` | `packages/investigator-ui` | private (bundled into the server as a single HTML) |
| `@kajidog/investigation-shared` | `packages/shared` | private (wire types) |

## Development

```bash
pnpm install
pnpm build          # UI (vite singlefile) → server (tsup, copies mcp-app.html)
pnpm test           # vitest
pnpm lint           # biome

# UI standalone dev with mock data (no Datadog needed):
pnpm --filter @kajidog/investigator-ui dev

# Server dev (stdio):
DD_API_KEY=… DD_APP_KEY=… pnpm --filter @kajidog/mcp-datadog-logs dev
```

### Smoke test with MCP Inspector

```bash
pnpm build
DD_API_KEY=… DD_APP_KEY=… npx @modelcontextprotocol/inspector node apps/mcp-datadog-logs/dist/index.js
```

## Releasing

Managed with [changesets](https://github.com/changesets/changesets):

1. `pnpm changeset` — describe the change, pick a bump
2. Merge to `main` — the Release workflow opens a "Version Packages" PR
3. Merge that PR — CI publishes to npm (requires the `NPM_TOKEN` repo secret)

Note: keep `src/version.ts` in the server package in sync with its
`package.json` version when merging a version PR.

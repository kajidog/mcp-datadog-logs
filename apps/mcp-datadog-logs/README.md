# @kajidog/mcp-datadog-logs

MCP server for investigating **Datadog logs** with AI — including an interactive
**MCP Apps UI** (timeline chart, facet breakdowns, log table) rendered directly in
MCP Apps-capable hosts such as Claude, and one-click export to a **self-contained
HTML report** you can share with your team (print it to PDF from the browser if
needed).

## Features

- 🔎 `datadog_search_logs` — quick log search for the model (compact text output)
- 📊 `datadog_aggregate_logs` — counts by facet or timeseries for the model
- 🕵️ `datadog_run_investigation` — headless investigation for the model:
  - full result (log rows, timeline, facets) stored server-side under a `viewUUID`
  - the model receives only a compact summary — iterate without bloating context
  - pass the `viewUUID` to `datadog_investigate_logs` to display it, with optional
    plain-text `findings` shown in the UI and the HTML report
- 🖥️ `datadog_investigate_logs` — opens the interactive investigation UI:
  - stacked timeline chart of log volume by status
  - facet sidebar (service / status / host / custom `groupBy`) — click to filter
  - log table with expandable full-JSON detail and load-more pagination
  - adjust query & time range and re-run right from the UI
  - **Export** button → self-contained HTML report written to disk
- stdio transport only, zero server-side state persistence

## Setup

Requires Node.js >= 20 and a Datadog API key + application key
(the application key needs the `logs_read_data` scope).

### Claude Code

```bash
claude mcp add datadog-logs \
  -e DD_API_KEY=<your-api-key> \
  -e DD_APP_KEY=<your-app-key> \
  -e DD_SITE=ap1.datadoghq.com \
  -- npx -y @kajidog/mcp-datadog-logs
```

### Claude Desktop (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "datadog-logs": {
      "command": "npx",
      "args": ["-y", "@kajidog/mcp-datadog-logs"],
      "env": {
        "DD_API_KEY": "<your-api-key>",
        "DD_APP_KEY": "<your-app-key>",
        "DD_SITE": "ap1.datadoghq.com"
      }
    }
  }
}
```

Then ask: *"Investigate error logs for the payments service in the last 4 hours"*.

### MCP Inspector

```bash
DD_SITE=ap1.datadoghq.com \
DD_API_KEY=<your-api-key> \
DD_APP_KEY=<your-app-key> \
npx @modelcontextprotocol/inspector node apps/mcp-datadog-logs/dist/index.js
```

Use the same `DD_SITE` as the Datadog org where the API key and application key
were created. Japan is `ap1.datadoghq.com`; US1 is `datadoghq.com`.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DD_API_KEY` | ✅ | — | Datadog API key |
| `DD_APP_KEY` | ✅ | — | Datadog application key from the same org/site as `DD_API_KEY` (`logs_read_data` scope) |
| `DD_SITE` | | `datadoghq.com` | Datadog site, e.g. `ap1.datadoghq.com`, `datadoghq.eu`, `us5.datadoghq.com` |
| `DD_LOGS_INDEXES` | | all | Comma-separated log indexes to search |
| `MCP_DATADOG_EXPORT_DIR` | | `~/Downloads` (or cwd) | Where exported HTML reports are written |
| `MCP_DATADOG_MAX_ROWS` | | `200` | Max log rows per investigation (hard cap 500) |

Required Datadog permissions are documented in
[`docs/datadog-permissions.md`](../../docs/datadog-permissions.md).

## Tools

| Tool | Audience | Description |
|---|---|---|
| `datadog_search_logs` | model | Search logs, compact text lines + pagination cursor |
| `datadog_aggregate_logs` | model | Count by facet (`groupBy`) or timeseries (`interval`) |
| `datadog_run_investigation` | model | Headless investigation stored in a server-side session; returns a compact summary + `viewUUID`. Iterate on the same `viewUUID`, load more rows with `cursor`, attach `findings` |
| `datadog_investigate_logs` | model → UI | Run a full investigation and open the interactive UI. Pass a `viewUUID` from `datadog_run_investigation` to display that session without re-fetching |
| `_get_view_state` / `_run_investigation` / `_get_log_detail` / `_export_report` | UI only | Internal bridge tools called by the app (hidden from the model) |

## Exported reports

`Export` in the UI writes a single `.html` file (inline CSS + SVG chart, no
external requests) to `MCP_DATADOG_EXPORT_DIR` and asks the OS to open it in the
default browser. If the server is running in a headless or remote environment,
the file is still written and the UI shows the saved path. Use the browser's
*Print → Save as PDF* for a PDF copy.

## Rate limits

Datadog APIs can return `429 Too Many Requests` when an endpoint's rate limit is
exceeded. This server enables the Datadog SDK retry behavior for 429/5xx
responses and runs the multi-request investigation pipeline sequentially to avoid
request bursts.

If 429 still occurs, wait for the Datadog rate-limit window to reset and retry
with a narrower time range or fewer repeated UI refreshes.

## License

MIT

---
'@kajidog/mcp-datadog-logs': minor
---

Three log-investigation upgrades:

- **Message pattern analysis**: every investigation now clusters the fetched log messages into templates (variable tokens like ids, timestamps and numbers become `<*>`). Tool summaries list the top patterns with counts and percentages, the investigator UI gets a pattern panel that filters the log table on click, and HTML reports include a patterns section.
- **Session persistence**: investigation sessions are mirrored to disk (default `~/.cache/mcp-datadog-logs/sessions`, override with `MCP_DATADOG_SESSION_DIR`, disable with `MCP_DATADOG_PERSIST_SESSIONS=false`), so a viewUUID keeps working across server restarts. Persisted sessions are pruned beyond 50 files or 7 days.
- **CSV/JSON export**: `datadog_export_report` accepts `format: 'html' | 'csv' | 'json'`; csv/json write the fetched log rows as data instead of an HTML report. The UI log table gains CSV/JSON buttons that export exactly the currently filtered rows, and the keyword filter now highlights matches in the message column.

Also in this release:

- **Markdown findings**: `findings` are now rendered as Markdown (GFM) in the UI and HTML reports, with raw HTML escaped and links restricted to safe schemes.
- **Behavior change — explicit time zones required**: absolute ISO 8601 timestamps in `from`/`to` must now include a time zone (`Z` or an offset like `+09:00`); values without one (e.g. `2026-07-12T10:00:00`) are rejected as ambiguous. Datadog time math (`now-4h`) is unaffected.
- `datadog_aggregate_logs` timeseries (`interval`) now groups by the `groupBy` facet instead of always by status.

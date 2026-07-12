---
'@kajidog/mcp-datadog-logs': minor
---

Three log-investigation upgrades:

- **Message pattern analysis**: every investigation now clusters the fetched log messages into templates (variable tokens like ids, timestamps and numbers become `<*>`). Tool summaries list the top patterns with counts and percentages, the investigator UI gets a pattern panel that filters the log table on click, and HTML reports include a patterns section.
- **Session persistence**: investigation sessions are mirrored to disk (default `~/.cache/mcp-datadog-logs/sessions`, override with `MCP_DATADOG_SESSION_DIR`, disable with `MCP_DATADOG_PERSIST_SESSIONS=false`), so a viewUUID keeps working across server restarts. Persisted sessions are pruned beyond 50 files or 7 days.
- **CSV/JSON export**: `datadog_export_report` accepts `format: 'html' | 'csv' | 'json'`; csv/json write the fetched log rows as data instead of an HTML report. The UI log table gains CSV/JSON buttons that export exactly the currently filtered rows, and the keyword filter now highlights matches in the message column.

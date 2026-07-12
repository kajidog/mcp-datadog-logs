# @kajidog/mcp-datadog-logs

## 0.2.1

### Patch Changes

- 7b7c90c: Preserve the stored query, resolved time window, grouping, and row limit when continuing an investigation with `viewUUID` and `cursor`. Relative time ranges are frozen to the original session's absolute timestamps, preventing cursor pagination from resetting or shifting the window and producing summaries whose aggregate totals disagreed with the stored log rows.

## 0.2.0

### Minor Changes

- c3920d1: Add `datadog_run_investigation`: a UI-less, session-backed investigation tool. The full result (log rows, timeline, facets) is stored server-side under a viewUUID while the model receives only a compact summary, so the AI can iterate on an investigation without bloating context. `datadog_investigate_logs` now accepts a `viewUUID` to display an already-investigated session without re-fetching, plus a `findings` parameter whose plain-text notes are shown in a new UI panel and included in the exported HTML report.
- 491aafe: Initial release: Datadog logs investigation MCP server with an interactive MCP Apps UI (timeline chart, facet breakdowns, adjustable query/time range, load-more log table) and self-contained HTML report export.
- b0fdca0: Make the exported HTML report interactive and theme-switchable. The log list can now be filtered after generation: free-text search, clicking a timeline bar to narrow to that time bucket, and clicking legend statuses to filter by status (all combinable, with active-filter chips and a clear button). A header toggle switches the color theme between Auto (OS preference), Light, and Dark, persisted via localStorage.
- 5cd09e6: Three log-investigation upgrades:

  - **Message pattern analysis**: every investigation now clusters the fetched log messages into templates (variable tokens like ids, timestamps and numbers become `<*>`). Tool summaries list the top patterns with counts and percentages, the investigator UI gets a pattern panel that filters the log table on click, and HTML reports include a patterns section.
  - **Session persistence**: investigation sessions are mirrored to disk (default `~/.cache/mcp-datadog-logs/sessions`, override with `MCP_DATADOG_SESSION_DIR`, disable with `MCP_DATADOG_PERSIST_SESSIONS=false`), so a viewUUID keeps working across server restarts. Persisted sessions are pruned beyond 50 files or 7 days.
  - **CSV/JSON export**: `datadog_export_report` accepts `format: 'html' | 'csv' | 'json'`; csv/json write the fetched log rows as data instead of an HTML report. The UI log table gains CSV/JSON buttons that export exactly the currently filtered rows, and the keyword filter now highlights matches in the message column.

  Also in this release:

  - **Markdown findings**: `findings` are now rendered as Markdown (GFM) in the UI and HTML reports, with raw HTML escaped and links restricted to safe schemes.
  - **Behavior change — explicit time zones required**: absolute ISO 8601 timestamps in `from`/`to` must now include a time zone (`Z` or an offset like `+09:00`); values without one (e.g. `2026-07-12T10:00:00`) are rejected as ambiguous. Datadog time math (`now-4h`) is unaffected.
  - `datadog_aggregate_logs` timeseries (`interval`) now groups by the `groupBy` facet instead of always by status.

- 2ca0452: Add `datadog_export_report`, a model-facing tool that writes the self-contained HTML report for an investigation session (`viewUUID`) without opening the UI, and a new `MCP_DATADOG_TIMEZONE` environment variable (IANA name, default UTC) that controls the time zone of all timestamps in exported reports.

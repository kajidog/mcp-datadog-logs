# @kajidog/mcp-datadog-logs

## 0.3.0

### Minor Changes

- 9b25fa7: Add cross-source investigation across Datadog and a metrics query tool

  - New `datadog_query_metrics` tool: query metric timeseries with the classic
    query syntax (`avg:system.cpu.user{service:web} by {host}`) and get compact
    per-series stats plus downsampled values (requires the `timeseries_query`
    scope).
  - Investigation tools (`datadog_run_investigation` / `datadog_investigate_logs`
    / `_run_investigation`) now fetch Datadog events (deploys, alerts) for the
    same window by default (`includeEvents` / `eventsQuery`) and optional metric
    series (`metricsQueries`, up to 4). Missing `events_read` /
    `timeseries_query` scopes degrade gracefully: the fetch is skipped and noted
    in the result's `notices` instead of failing the run.
  - Log rows now carry the extracted `trace_id`, and investigation summaries list
    trace candidates (error-heavy first) with a ready-to-use
    `datadog_get_trace trace_id=...` pivot.
  - Investigator UI: deploy/alert markers on the timeline, an event list that
    filters logs to the event's time bucket, a metrics panel, and copyable
    trace-id chips on log rows.
  - HTML report: event markers on the timeline SVG, an events table, a metrics
    section with sparklines; CSV export gains a `trace_id` column.

- 8bc2945: Add trace and event correlation tools, and richer search_logs output

  - New `datadog_get_trace` tool: fetches all APM spans of a trace via the Spans API (cursor pagination up to 500 spans) and renders a chronological parent/child tree with service, resource, span type, start offset, duration, and error markers
  - New `datadog_search_events` tool: searches Datadog events (deployments, monitor alerts, config changes) so error windows found in logs can be correlated with what changed
  - `datadog_search_logs` lines now include `trace_id=<id>` when the log carries one (pivot point for `datadog_get_trace`) and accept an `attributes` parameter to append selected log attributes as `key=value`
  - 403 errors from the new tools name the scope they actually need (`apm_read` for traces, `events_read` for events) instead of `logs_read_data`; required scopes are documented in the README and docs/datadog-permissions.md

- 53405f0: Make LLM-facing list params and attribute truncation more forgiving, based on real investigation feedback:

  - `attributes` (search_logs, get_session_logs) and `fields`/`status` (get_session_logs) now also accept a comma-separated string ("a,b,c") in addition to a JSON array, instead of failing validation
  - Attribute values appended as `key=value` are now truncated at 300 chars (was 100) and middle-truncated so the tail survives — the decisive part of error strings (e.g. AWS "…, StatusCode: 400, FooException") often sits at the end
  - Documented that Datadog free-text queries only match the log message (use `@path:*substring*` for custom attributes), and pointed long-value readers to get_session_logs detail mode

- a4cb0bc: Session drill-down tool and leaner tool output for fewer calls and less context

  - New `datadog_get_session_logs` tool: reads rows already stored in a `datadog_run_investigation` session with zero extra Datadog API calls. List mode filters by `status` / `service` / message `pattern` (the summary's `#N`) / `contains` substring with `offset`/`limit` paging; detail mode (`row` index or `logId`) returns one full raw log as JSON, with `fields` to select attribute dot-paths and a bounded overview fallback for oversized logs
  - `datadog_run_investigation` summaries are now drillable: message patterns are numbered (`#1`…), sample rows carry their stored row index (`[N]`), and sample selection prefers error rows over the first N fetched
  - `datadog_get_trace` output is leaner: runs of identical leaf sibling spans collapse into one `service resource [type] +offset dur xN (total …)` line by default (`collapse: false` restores the full tree), `errors_only` renders just error spans plus their ancestor chains, and `max_spans` caps the rendered tree per call
  - `datadog_search_logs` gains `dedupe: true` to cluster the fetched page into message patterns (one `Nx template — e.g. …` line per pattern) and its description now steers broad investigations toward `datadog_run_investigation`
  - `datadog_search_events` gains `max_tags` (0 hides tags for a pure event timeline)

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

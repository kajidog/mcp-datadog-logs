---
'@kajidog/mcp-datadog-logs': minor
---

Add cross-source investigation across Datadog and a metrics query tool

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

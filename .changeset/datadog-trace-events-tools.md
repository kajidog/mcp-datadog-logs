---
'@kajidog/mcp-datadog-logs': minor
---

Add trace and event correlation tools, and richer search_logs output

- New `datadog_get_trace` tool: fetches all APM spans of a trace via the Spans API (cursor pagination up to 500 spans) and renders a chronological parent/child tree with service, resource, span type, start offset, duration, and error markers
- New `datadog_search_events` tool: searches Datadog events (deployments, monitor alerts, config changes) so error windows found in logs can be correlated with what changed
- `datadog_search_logs` lines now include `trace_id=<id>` when the log carries one (pivot point for `datadog_get_trace`) and accept an `attributes` parameter to append selected log attributes as `key=value`

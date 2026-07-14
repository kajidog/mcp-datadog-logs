---
'@kajidog/mcp-datadog-logs': minor
---

Session drill-down tool and leaner tool output for fewer calls and less context

- New `datadog_get_session_logs` tool: reads rows already stored in a `datadog_run_investigation` session with zero extra Datadog API calls. List mode filters by `status` / `service` / message `pattern` (the summary's `#N`) / `contains` substring with `offset`/`limit` paging; detail mode (`row` index or `logId`) returns one full raw log as JSON, with `fields` to select attribute dot-paths and a bounded overview fallback for oversized logs
- `datadog_run_investigation` summaries are now drillable: message patterns are numbered (`#1`…), sample rows carry their stored row index (`[N]`), and sample selection prefers error rows over the first N fetched
- `datadog_get_trace` output is leaner: runs of identical leaf sibling spans collapse into one `service resource [type] +offset dur xN (total …)` line by default (`collapse: false` restores the full tree), `errors_only` renders just error spans plus their ancestor chains, and `max_spans` caps the rendered tree per call
- `datadog_search_logs` gains `dedupe: true` to cluster the fetched page into message patterns (one `Nx template — e.g. …` line per pattern) and its description now steers broad investigations toward `datadog_run_investigation`
- `datadog_search_events` gains `max_tags` (0 hides tags for a pure event timeline)

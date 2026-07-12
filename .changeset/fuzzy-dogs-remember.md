---
"@kajidog/mcp-datadog-logs": patch
---

Preserve the stored query, time range, grouping, and row limit when continuing an investigation with `viewUUID` and `cursor`. This prevents cursor pagination from resetting an existing session to the default `*` query and `now-1h` range, which could produce summaries whose aggregate totals disagreed with the stored log rows.

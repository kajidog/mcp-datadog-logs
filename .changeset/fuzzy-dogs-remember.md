---
"@kajidog/mcp-datadog-logs": patch
---

Preserve the stored query, resolved time window, grouping, and row limit when continuing an investigation with `viewUUID` and `cursor`. Relative time ranges are frozen to the original session's absolute timestamps, preventing cursor pagination from resetting or shifting the window and producing summaries whose aggregate totals disagreed with the stored log rows.

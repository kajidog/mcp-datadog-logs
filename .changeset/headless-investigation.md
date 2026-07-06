---
'@kajidog/mcp-datadog-logs': minor
---

Add `datadog_run_investigation`: a UI-less, session-backed investigation tool. The full result (log rows, timeline, facets) is stored server-side under a viewUUID while the model receives only a compact summary, so the AI can iterate on an investigation without bloating context. `datadog_investigate_logs` now accepts a `viewUUID` to display an already-investigated session without re-fetching, plus a `findings` parameter whose plain-text notes are shown in a new UI panel and included in the exported HTML report.

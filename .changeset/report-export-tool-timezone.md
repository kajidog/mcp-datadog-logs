---
'@kajidog/mcp-datadog-logs': minor
---

Add `datadog_export_report`, a model-facing tool that writes the self-contained HTML report for an investigation session (`viewUUID`) without opening the UI, and a new `MCP_DATADOG_TIMEZONE` environment variable (IANA name, default UTC) that controls the time zone of all timestamps in exported reports.

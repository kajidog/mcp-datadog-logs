---
'@kajidog/mcp-datadog-logs': minor
---

Make LLM-facing list params and attribute truncation more forgiving, based on real investigation feedback:

- `attributes` (search_logs, get_session_logs) and `fields`/`status` (get_session_logs) now also accept a comma-separated string ("a,b,c") in addition to a JSON array, instead of failing validation
- Attribute values appended as `key=value` are now truncated at 300 chars (was 100) and middle-truncated so the tail survives — the decisive part of error strings (e.g. AWS "…, StatusCode: 400, FooException") often sits at the end
- Documented that Datadog free-text queries only match the log message (use `@path:*substring*` for custom attributes), and pointed long-value readers to get_session_logs detail mode

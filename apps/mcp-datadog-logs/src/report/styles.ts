/**
 * Inline stylesheet for the exported report. Palette follows the dataviz
 * reference instance: status colors are reserved for log status, chart
 * chrome/ink tokens swap between light and dark via prefers-color-scheme.
 */
export const REPORT_CSS = `
:root {
  --surface-1: #fcfcfb;
  --page: #f9f9f7;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --gridline: #e1e0d9;
  --baseline: #c3c2b7;
  --border: rgba(11, 11, 11, 0.1);
  --status-error: #d03b3b;
  --status-warn: #fab219;
  --status-info: #2a78d6;
  --status-debug: #898781;
  --code-bg: #f0efec;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface-1: #1a1a19;
    --page: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --baseline: #383835;
    --border: rgba(255, 255, 255, 0.1);
    --status-error: #d03b3b;
    --status-warn: #fab219;
    --status-info: #3987e5;
    --status-debug: #898781;
    --code-bg: #262624;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
main { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; }
header h1 { font-size: 22px; margin: 0 0 4px; }
header .meta { color: var(--text-secondary); font-size: 13px; }
header .meta code {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
}
section { margin-top: 28px; }
h2 { font-size: 15px; margin: 0 0 12px; color: var(--text-primary); }
.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile .label { color: var(--text-muted); font-size: 12px; }
.tile .value { font-size: 26px; font-weight: 600; margin-top: 2px; }
.tile .value.error { color: var(--status-error); }
.legend { display: flex; gap: 16px; margin-top: 10px; flex-wrap: wrap; }
.legend .item { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 12px; }
.legend .swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.chart-scroll { overflow-x: auto; }
.facets { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th {
  text-align: left;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid var(--gridline);
  padding: 6px 8px;
}
td { padding: 6px 8px; border-bottom: 1px solid var(--gridline); vertical-align: top; }
td.num { text-align: right; }
tr:last-child td { border-bottom: none; }
.status-badge {
  display: inline-block;
  min-width: 46px;
  text-align: center;
  border-radius: 5px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}
.status-badge.error { background: var(--status-error); }
.status-badge.warn { background: var(--status-warn); color: #0b0b0b; }
.status-badge.info { background: var(--status-info); }
.status-badge.debug, .status-badge.other { background: var(--status-debug); }
.logs details { border-bottom: 1px solid var(--gridline); }
.logs details:last-child { border-bottom: none; }
.logs summary {
  display: grid;
  grid-template-columns: 170px 64px 140px 1fr;
  gap: 10px;
  padding: 7px 8px;
  cursor: pointer;
  list-style: none;
  align-items: baseline;
}
.logs summary::-webkit-details-marker { display: none; }
.logs summary:hover { background: var(--code-bg); }
.logs summary .time { color: var(--text-secondary); font-size: 12px; white-space: nowrap; }
.logs summary .service { color: var(--text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logs summary .message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logs pre {
  background: var(--code-bg);
  border-radius: 8px;
  margin: 6px 8px 12px;
  padding: 12px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.45;
}
footer { margin-top: 40px; color: var(--text-muted); font-size: 12px; }
@media print {
  body { background: #fff; }
  .card { border: 1px solid #ddd; }
  .logs summary .message { white-space: normal; }
}
`

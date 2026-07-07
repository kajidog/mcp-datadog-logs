/**
 * Inline client-side script for the exported report. Static code only —
 * never interpolate user data into this string. Must not contain the
 * literal "</script" sequence.
 *
 * Behaviors:
 * - Theme toggle (auto/light/dark) persisted in localStorage, applied via
 *   data-theme on <html>.
 * - Log filtering: free-text search, time range via timeline bar click,
 *   status via legend click. Filters combine with AND.
 */
export const REPORT_JS = `
(function () {
  'use strict';

  // --- Theme toggle -------------------------------------------------------
  var THEME_KEY = 'dd-logs-report-theme';
  var root = document.documentElement;
  var themeButtons = Array.prototype.slice.call(document.querySelectorAll('.theme-toggle button'));

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      theme = 'auto';
      root.removeAttribute('data-theme');
    }
    themeButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-value') === theme);
      btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-value') === theme ? 'true' : 'false');
    });
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* sandboxed */ }
  applyTheme(savedTheme);

  themeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var theme = btn.getAttribute('data-theme-value');
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* sandboxed */ }
      applyTheme(theme);
    });
  });

  // --- Log filtering ------------------------------------------------------
  var entries = Array.prototype.slice.call(document.querySelectorAll('.logs details')).map(function (el) {
    return {
      el: el,
      ts: Number(el.getAttribute('data-ts')),
      status: el.getAttribute('data-status') || '',
      text: (el.textContent || '').toLowerCase(),
    };
  });

  var searchInput = document.getElementById('log-search');
  var countLabel = document.getElementById('log-count');
  var clearButton = document.getElementById('clear-filters');
  var chipsHost = document.getElementById('active-filters');
  var noMatch = document.getElementById('log-no-match');
  var timeline = document.querySelector('.timeline');

  var state = { query: '', fromMs: null, toMs: null, statuses: {} };

  function activeStatuses() {
    return Object.keys(state.statuses).filter(function (s) { return state.statuses[s]; });
  }

  function hasAnyFilter() {
    return state.query !== '' || state.fromMs !== null || activeStatuses().length > 0;
  }

  function formatBucketTime(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function renderChips() {
    if (!chipsHost) return;
    chipsHost.textContent = '';
    if (state.fromMs !== null) {
      var chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.textContent = 'Time: ' + formatBucketTime(state.fromMs) + ' \\u2013 ' + formatBucketTime(state.toMs) + ' UTC';
      chipsHost.appendChild(chip);
    }
    activeStatuses().forEach(function (status) {
      var chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.textContent = 'Status: ' + status;
      chipsHost.appendChild(chip);
    });
  }

  function applyFilters() {
    var query = state.query;
    var statuses = activeStatuses();
    var visible = 0;
    entries.forEach(function (entry) {
      var show = true;
      if (query && entry.text.indexOf(query) === -1) show = false;
      if (show && state.fromMs !== null && !isNaN(entry.ts)) {
        if (entry.ts < state.fromMs || entry.ts >= state.toMs) show = false;
      }
      if (show && statuses.length > 0 && statuses.indexOf(entry.status) === -1) show = false;
      if (show) visible++;
      if (show) { entry.el.removeAttribute('hidden'); } else { entry.el.setAttribute('hidden', ''); }
    });
    if (countLabel) {
      countLabel.textContent = hasAnyFilter()
        ? 'Showing ' + visible + ' of ' + entries.length + ' logs'
        : entries.length + ' logs';
    }
    if (clearButton) clearButton.hidden = !hasAnyFilter();
    if (noMatch) noMatch.hidden = !(entries.length > 0 && visible === 0);
    renderChips();
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.query = searchInput.value.trim().toLowerCase();
      applyFilters();
    });
  }

  // Timeline bar click -> time range filter (click again to clear).
  var buckets = Array.prototype.slice.call(document.querySelectorAll('.timeline .bucket'));

  function selectBucket(bucket) {
    var from = Number(bucket.getAttribute('data-from'));
    var to = Number(bucket.getAttribute('data-to'));
    var isSelected = bucket.classList.contains('selected');
    buckets.forEach(function (b) { b.classList.remove('selected'); });
    if (isSelected || isNaN(from) || isNaN(to)) {
      state.fromMs = null;
      state.toMs = null;
      if (timeline) timeline.classList.remove('has-selection');
    } else {
      bucket.classList.add('selected');
      state.fromMs = from;
      state.toMs = to;
      if (timeline) timeline.classList.add('has-selection');
    }
    applyFilters();
  }

  buckets.forEach(function (bucket) {
    bucket.addEventListener('click', function () { selectBucket(bucket); });
    bucket.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectBucket(bucket);
      }
    });
  });

  // Legend click -> status filter toggle (multi-select).
  Array.prototype.slice.call(document.querySelectorAll('.legend .item[data-status]')).forEach(function (item) {
    item.addEventListener('click', function () {
      var status = item.getAttribute('data-status');
      state.statuses[status] = !state.statuses[status];
      item.classList.toggle('active', !!state.statuses[status]);
      item.setAttribute('aria-pressed', state.statuses[status] ? 'true' : 'false');
      applyFilters();
    });
  });

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      state.query = '';
      state.fromMs = null;
      state.toMs = null;
      state.statuses = {};
      if (searchInput) searchInput.value = '';
      buckets.forEach(function (b) { b.classList.remove('selected'); });
      if (timeline) timeline.classList.remove('has-selection');
      Array.prototype.slice.call(document.querySelectorAll('.legend .item[data-status]')).forEach(function (item) {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
      });
      applyFilters();
    });
  }

  applyFilters();
})();
`

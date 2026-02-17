---
id: TASK-1
title: >-
  reload data on webpage first load and show datetime load close to button
  reload data when finished reloading
status: Done
assignee:
  - '@{myself}'
created_date: '2026-02-16 13:10'
updated_date: '2026-02-16 13:20'
labels:
  - frontend
  - ui
  - tests
dependencies: []
references:
  - src/static/templates/header.html
  - src/static/ts/app.ui.csv.ts
  - src/static/ts/app.ui.interactions.ts
  - src/main.py
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automatically trigger a CSV data reload when the web UI opens if the CSV cache is missing or stale, and display the last-loaded datetime adjacent to the Reload button after the reload completes. Add tests and docs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On first page load, if CSV status has no last_updated or is_stale=true, client triggers POST /api/reload-csv and shows spinner + disabled reload button.
- [x] #2 When reload finishes, header shows last-loaded datetime in #csv-updated next to reload button; visible to screen readers.
- [x] #3 Do not trigger a reload if one is already in progress or last_updated is recent.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add client-side auto-reload on first page load when CSV cache is missing or stale (guarded by reload_in_progress and csvReloading).\n2. Prevent duplicate auto-reloads using sessionStorage flag.\n3. Make #csv-updated screen-reader friendly (role=\status\, aria-live=\polite\).\n4. User will add Playwright e2e + unit tests and update docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented client-side auto-reload on first load and added aria-live to #csv-updated; guarded with sessionStorage to avoid duplicate auto-reloads. Waiting for user to add Playwright e2e + unit tests and docs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented client-side first-load CSV auto-reload when cache is missing or stale; added sessionStorage guard to avoid duplicate auto-reloads; made #csv-updated accessible (role=status, aria-live=polite); UI shows spinner/disabled reload button while reloading. Created follow-up TASK-2 for tests/docs.
<!-- SECTION:FINAL_SUMMARY:END -->

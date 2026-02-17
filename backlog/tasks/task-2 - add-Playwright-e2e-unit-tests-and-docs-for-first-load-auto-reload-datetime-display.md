---
id: TASK-2
title: >-
  add Playwright e2e + unit tests and docs for first-load auto-reload & datetime
  display
status: To Do
assignee: []
created_date: '2026-02-16 13:19'
labels:
  - tests
  - frontend
  - ui
dependencies: []
references:
  - src/static/ts/app.ui.interactions.ts
  - src/static/templates/header.html
  - tests/e2e/helpers.ts
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Playwright end-to-end test(s) and unit tests covering the client-side first-load auto-reload and the #csv-updated datetime display + update user docs/README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Playwright e2e: simulate missing/stale CSV status, assert POST /api/reload-csv is triggered and #csv-updated shows a datetime after reload completes.
- [ ] #2 Unit tests: cover fetchCsvStatus, reloadCsv and updateCsvStatusUI UI state transitions and aria-live update for #csv-updated.
- [ ] #3 Docs: update user docs and README to document first-load auto-reload behaviour and accessibility notes.
<!-- AC:END -->

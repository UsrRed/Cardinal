---
name: webapp-testing
description: Write and run real browser end-to-end tests (Playwright) that simulate actual user clicks and typing for a web front-end, covering both the error path and the happy path. Use during test_hardening / feature_check for any project with a web UI.
---

# Real-user web testing

A project with a web front-end is not verified until a real browser has clicked through it. Unit tests alone miss broken wiring between UI and API.

1. **Install and drive Playwright headless** (`npx playwright install --with-deps chromium` if not already present, then a `*.spec.ts`/`*.spec.js` test file run via `npx playwright test`).
2. **Happy path**: script the main user journey (the thing the SPEC says this app is for) as real `click`/`fill`/`press` actions, not direct API calls. Assert the UI ends in the expected state, and that there are no console errors and no failed network requests during the run.
3. **Error path**: submit at least one deliberately invalid input (empty required field, malformed value, wrong type) through the actual UI and assert a clear, user-visible error message appears — not a silent failure, a raw stack trace, or a stuck spinner.
4. **Don't stub the backend.** Run against the real dev server/API for these tests; mocking defeats the purpose of an end-to-end check.
5. If the project has no web front-end (API-only, CLI, library), this skill does not apply — say so and skip it rather than forcing a browser test where there's nothing to click.

Fix what the tests catch — a wired-but-broken button is a bug, not a testing footnote.

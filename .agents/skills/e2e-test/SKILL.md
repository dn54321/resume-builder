# E2E Test Skill

Run end-to-end tests before finishing a ticket to catch integration failures that unit tests miss.

> **Headless by default:** Playwright now runs headless unless `PW_HEADED=1` is set
> (both `frontend/playwright.config.ts` and `e2e/playwright.config.ts`). No Chrome
> popups. Set `PW_HEADED=1` only when you need to watch the browser interactively.
> This applies to agents too — workers should NOT set PW_HEADED.

## When to use

Use this skill when:
- You've changed API routes, auth flow, or form submissions (backend e2e)
- You've changed page layouts, navigation, form inputs, or user flows (frontend e2e)
- You've changed shared components used across multiple pages
- The pre-push hooks pass but you want integration verification

## Backend E2E

```bash
cd backend && pnpm test:e2e
```

Requires a running database. If no database is available, skip and note in `pr-body.md`.

## Frontend E2E

```bash
cd frontend

# Install Playwright browsers (one-time, skip if already installed)
npx playwright install chromium --with-deps 2>/dev/null || true

# Build the app (required for e2e)
pnpm build-only

# Run e2e tests
pnpm test:e2e
```

## If tests fail

1. Read the failure output carefully
2. Fix the code OR update the e2e test if selectors/structure changed
3. Re-run until all pass
4. Note in `pr-body.md` that e2e tests were run and pass

## Common failures

- **Selector not found**: The component's DOM structure changed. Update the e2e test selector to match.
- **Timeout**: The page didn't load in time. Check if the server is running, increase timeout, or add `waitForSelector`.
- **Assertion mismatch**: Expected text/content not found. The UI may have changed — update the test expectation.

## Screenshot artifacts

If e2e tests produce screenshots, upload them to the PR body using the `screenshot` and `imgbb-upload` skills.

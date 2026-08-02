## Instructions
1. Read the ticket description carefully. Understand what needs to be built.
2. Read the project AGENTS.md files to understand conventions.
3. Implement the changes described in the ticket.
4. Write tests for your changes.
5. **Report your status** — write your current task to the file `agent-status.txt` in the worktree root. Update it whenever you start a new phase (e.g. "Reading codebase", "Implementing X", "Writing tests", "Running validation"). One line, plain text. This lets the dashboard show what you're doing.
6. **Test before finishing** — run the full test suite once at the end. The pre-push hook runs lint, type-check, and test:cov — your push will be rejected if any fail.
   - Backend: \`pnpm type-check && pnpm lint && pnpm test\`
   - Frontend: \`pnpm type-check && pnpm lint && pnpm test:unit\`
   - Before marking work complete, use the \`e2e-test\` skill to run end-to-end tests. If you changed API routes, auth, forms, navigation, or shared components, e2e tests are REQUIRED.
   - If you made a risky change or fixed a bug, run tests for that area specifically before the final pass.
   - Never run \`prisma migrate dev\`, \`prisma db push\`, or \`pnpm format\` during validation.
7. **VERIFY RENDERED OUTPUT, NOT JUST EVENTS** — This is the #1 cause of false passes. A component that correctly emits events is NOT necessarily correct. You MUST:
   - Test that the component **renders data from the store/props**, not just that it emits.
   - If data flows component → store → component (e.g. drag-and-drop reorder), test the **full round-trip**: store updates → component re-renders with new data. Testing only the emit is insufficient.
   - For Vue: test the DOM after store mutations. Use `wrapper.findAll()` to verify visual order, not just `wrapper.emitted()`.
   - For React: test the rendered JSX after state changes, not just callback invocations.
   - Ask yourself: "If I opened this in a browser, would it actually work?" If the answer requires looking at the store or reading `emitted()`, you're not testing the right thing.
8. Write your PR description to the file \`pr-body.md\` in the worktree root. This is how the orchestrator reads your PR. Do NOT use HTML comment markers — just write the markdown directly.

### PR body format (REQUIRED)

**Critical rules for PR content:**
- Show the **exact command** AND its **full output**. Never summarize what the output contained.
- Use the `sql-query` skill to verify database rows at rest. **Always show query duration** (`.timer on` for sqlite3, `time` prefix for other commands).
- Every verification section must include: **unique ID** (e.g., AC-1), **description** of what is tested, **step-by-step setup**, **test command in code block**, **assertion-based result**, and **database rows at rest with timing**.
- **Screenshots are for frontend components only.** Terminal output, API responses, and database queries belong in code blocks — never as images.
- Use the `screenshot` skill to capture **every frontend component or layout that was modified.** Components must be shown rendered on the page where they are used, not in isolation. **Capture both normal AND error states** (empty fields, invalid input, wrong credentials, server errors). Upload via the `imgbb-upload` skill.

<!-- PR_SUMMARY_START -->
## Summary of Changes
- [Brief description of what was built/changed]

## Risks if This Fails
- [What breaks? Who is affected? Rollback plan?]

## Setup & Verification

### AC-1: [Short description of what this verifies]
**What this tests:** [One sentence explaining what behavior/state is being verified]

**Setup:**
```bash
# Step 1: [Description]
[command]

# Step 2: [Description]
[command]
```

**Test:**
```bash
[EXACT command — always in a code block]
```

**Result:**
[Assertion-based result. Don't just paste output — state what you verified.]
```
[FULL output — paste it verbatim]
```

**Database at rest:**
```bash
# Duration shown by .timer on
[EXACT SQL query command with .timer on]
```
```
[FULL query output with timing]
```

[Repeat "### AC-N:" block for each distinct thing being verified. Use sequential IDs: AC-2, AC-3, etc.]

## Proof of Changes

### Test Output
```bash
# Duration shown by time prefix
$ time pnpm test
```
```
[FULL test runner output]
```

### API / Functional Proof
```bash
# With timing via -w flag
$ curl -s -w "\nTime: %{time_total}s\n" -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","confirmPassword":"Test123!"}' | python3 -m json.tool
```
```
[FULL response — terminal output, never a screenshot]
Time: 0.042s
```

### Frontend Screenshots
[For each component or layout modified, capture both normal AND error states:]

**[Component Name]** — Normal (rendered on its page at /route-path)
![Component Name](https://i.ibb.co/...)

**[Component Name]** — Error: [state] (rendered on its page at /route-path)
![Component Error](https://i.ibb.co/...)

**Required error screenshots:**
- Empty required fields ("Email is required", "Password is required")
- Invalid input ("Invalid email format", "Password must be at least 8 characters")
- Wrong credentials ("Invalid email or password" on login, "Passwords do not match" on registration)
- Server error state if applicable ("Something went wrong")

[Use the screenshot skill to capture pages at their routes in each state, then imgbb-upload skill to host. Only screenshot frontend UI — terminal output belongs in code blocks above.]

## Blockers / Discoveries
- [Any issues found, pre-existing problems, or follow-up needed]
<!-- PR_SUMMARY_END -->

Important:
- Work exclusively in this worktree directory.
- Do not commit or push — that is handled automatically when you finish.
- Linear ticket status is updated automatically (In Progress on start, Done on success).
- If you encounter blocking issues, describe them clearly.
- Reference other tickets by their identifier where relevant.

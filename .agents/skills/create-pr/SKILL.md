---
name: create-pr
description: |
  Create a GitHub pull request from the current branch. Use after completing
  ticket work — commits changes, pushes, creates the PR, and notifies the
  orchestrator. Triggers on "create PR", "submit PR", "open pull request",
  "create pull request", "gh pr create".
---

# Create PR Skill

Use this skill when you have finished implementing a ticket and written
`pr-body.md` in the worktree root. It commits, pushes, creates the PR,
and notifies the orchestrator via intercom.

## Prerequisites

- `pr-body.md` must exist in the worktree root with the PR description.
- The current branch must already be set up.
- `gh` CLI should be available (falls back to GitHub API if not).

## Writing a good PR body

Before running this skill, write `pr-body.md` with these sections:

```markdown
## Dependencies
<!-- List ALL PRs this depends on. Get these from the ticket refs in the TASK message. -->
- [TICKET-ID (#PR-NUM)](https://github.com/OWNER/REPO/pull/N) — one-line description

**Do not merge before:** TICKET-ID (#PR-NUM), ...

---

## Summary of Changes
- [Brief description of what was built/changed]

## Risks if This Fails
- [What breaks? Who is affected? Rollback plan?]

## Setup & Verification

### AC-1: [Short description of what this verifies]
**What this tests:** [One sentence]

**Setup:**
```bash
[commands to set up the test]
```

**Test:**
```bash
[EXACT command — always in a code block]
```

**Result:**
[Assertion-based result. Paste FULL output verbatim.]
```
[FULL output]
```

[Repeat AC-2, AC-3 for each verifiable thing]

## Proof of Changes

### Test Output
```bash
$ time pnpm test
```
```
[FULL test runner output with timing]
```

### Database at rest (if applicable)
```bash
# Duration shown by .timer on
[EXACT SQL query]
```
```
[FULL query output with timing]
```

### Frontend Screenshots (if applicable)
Use the screenshot + imgbb-upload skills to capture both normal AND error states.

## Blockers / Discoveries
- [Any issues found or follow-up needed]
```

Key rules:
- **ALWAYS include a Dependencies section at the top** — list every PR this depends on from the ticket refs. If there are no dependencies, write "None — can be merged independently."
- Get dependency PR numbers from the ticket refs (e.g. "ref: RES-10 RES-13") — find their PRs and link them
- Database queries must show duration (.timer on / time prefix)
- Screenshots are for frontend only — terminal output goes in code blocks
- Every verification needs: unique ID, description, setup, command, assertion, output
- Capture error states (empty fields, invalid input, wrong credentials) not just happy path

## Steps

### 1. Commit changes

```bash
git add -A
git commit -m "<ticket-title>" --allow-empty
```

Use the ticket title provided in the orchestrator prompt as the commit message.
If no title is available, use the first heading from `pr-body.md`.

### 2. Push the branch

```bash
git push -u origin HEAD
```

The branch name is already set up by the orchestrator. `HEAD` pushes the current branch.

### 3. Create the PR

**Preferred: `gh` CLI**
```bash
gh pr create \
  --base "$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main)" \
  --head "$(git branch --show-current)" \
  --title "<ticket-title>" \
  --body-file pr-body.md
```

**Fallback: GitHub API** (if `gh` is not available)
```bash
OWNER_REPO=$(git remote get-url origin | sed 's|.*github.com[:/]\(.*\)\.git|\1|')
BASE=$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main)
HEAD=$(git branch --show-current)
TITLE="<ticket-title>"
BODY=$(jq -Rs '.' pr-body.md)

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer ${GITHUB_TOKEN:-$GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$OWNER_REPO/pulls" \
  -d "{\"title\":\"$TITLE\",\"head\":\"$HEAD\",\"base\":\"$BASE\",\"body\":$BODY}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
PR_URL=$(echo "$BODY" | jq -r '.html_url // empty')

if [ -z "$PR_URL" ]; then
  echo "PR creation failed (HTTP $HTTP_CODE): $BODY"
  exit 1
fi
echo "$PR_URL"
```

### 4. Save the PR URL

```bash
echo "<pr-url>" > pr-url.txt
```

Replace `<pr-url>` with the actual URL from step 3.

### 5. Notify the orchestrator

```
intercom({ action: "send", to: "boss", message: "DONE: <pr-url>" })
```

This tells the boss the worker is finished and provides the PR URL.

### 6. Go idle

```
intercom({ action: "send", to: "server", message: "IDLE" })
```

This lets the server know you are free for the next ticket.

## Error Handling

- If `git push` fails because the branch already exists with different commits, force push: `git push -u origin HEAD --force-with-lease`
- If `gh pr create` says a PR already exists, use `gh pr view --json url` to get the existing URL
- If the GitHub API returns a 422 (PR already exists), search for the existing PR:
  ```bash
  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$OWNER_REPO/pulls?head=$OWNER_REPO:$HEAD&state=open"
  ```
- Never create duplicate PRs — always check for existing ones first.

## Validation

After creating the PR, verify:
```bash
cat pr-url.txt    # should contain the PR URL
git log -1 --oneline   # should show the commit
```

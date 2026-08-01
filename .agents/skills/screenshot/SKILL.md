---
name: screenshot
description: Capture screenshots of frontend components and layouts for PR proof sections. Use ONLY for web UI — never for terminal output or API responses. Triggers on "screenshot", "capture", "screen grab", "frontend proof".
---

# Screenshot

Capture visual proof of frontend components for PRs. Screenshots are **only** for
frontend UI — terminal output, API responses, and database queries go in code blocks.

## When to Screenshot

- Every frontend component that was **created or modified** needs a screenshot
- Components must be captured **rendered on the page where they are used**, not in isolation
- Capture the full browser viewport showing the component in its layout context
- **Capture BOTH normal AND error states.** For forms, this includes:
  - Empty required fields (e.g., "Email is required", "Password is required")
  - Invalid input (e.g., "Invalid email format", "Password too short")
  - Wrong credentials (e.g., "Invalid email or password", "Passwords do not match")
  - Server error state (e.g., "Something went wrong", "Network error")

## Prerequisites

Ensure the frontend dev server is running:

```bash
cd frontend && pnpm dev &
sleep 3
```

Install Playwright if not already available:

```bash
npx playwright install chromium
```

## Capturing Frontend Pages

### Method A: Playwright (preferred)

Capture a specific page at its route:

```bash
npx playwright screenshot --viewport-size=1280,720 \
  http://localhost:5173/login /tmp/login-page.png
```

For full-page captures (long scroll):

```bash
npx playwright screenshot --viewport-size=1280,900 --full-page \
  http://localhost:5173/dashboard /tmp/dashboard-full.png
```

### Method B: Playwright script (more control)

For pages that require interaction (login, navigation):

```bash
cat > /tmp/screenshot-page.js << 'SCRIPT'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Navigate and wait for render
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  // Optional: interact (fill form, click button)
  // await page.fill('input[name="email"]', 'test@test.com');
  // await page.fill('input[name="password"]', 'Test123!');
  // await page.click('button[type="submit"]');
  // await page.waitForURL('**/dashboard');

  await page.screenshot({ path: '/tmp/login-page.png', fullPage: false });
  await browser.close();
  console.log('Screenshot saved');
})();
SCRIPT
node /tmp/screenshot-page.js
```

## Uploading

After capturing, upload to imgbb (see `imgbb-upload` skill):

```bash
API_KEY=$(grep IMGBB_API_KEY .env.agent | cut -d= -f2)
RESPONSE=$(curl -s -F "key=$API_KEY" -F "image=@/tmp/login-page.png" https://api.imgbb.com/1/upload)
URL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['url'])")
echo "![Login page]($URL)"
```

Include the markdown in the PR body under `## Proof of Changes → ### Frontend Screenshots`.

## PR Screenshot Format

For each component, show:
1. What component it is
2. What route/page it appears on
3. The screenshot

```markdown
### Frontend Screenshots

**Login form** (rendered at /login)
![Login page](https://i.ibb.co/abc123/login.png)

**Navbar with auth state** (rendered at /, user logged in)
![Navbar](https://i.ibb.co/def456/navbar-authenticated.png)

**Registration form with validation errors** (rendered at /register)
![Register errors](https://i.ibb.co/ghi789/register-errors.png)
```

## What NOT to Screenshot

❌ Terminal output — use code blocks
❌ API responses (curl output) — use code blocks
❌ Database query results — use code blocks
❌ Test runner output — use code blocks
❌ Code or config files — use code blocks
❌ Isolated component renders (Storybook, etc.) — capture them on the actual page route

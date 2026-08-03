# RES-32: Restyle AccountView with Tailwind + shadcn-vue

## Summary

The AccountView page was restyled to use Tailwind CSS and shadcn-vue components. The work was already present in the codebase (merged as part of RES-29 dependency) and verified to be complete.

## Changes

### `frontend/src/views/AccountView.vue`
- Three Card sections: Account Info, Change Password, Delete Account
- Account Info shows user email with Label
- Change Password form with three Input+Label fields (current, new, confirm)
- Error Alert (destructive variant) for validation and API errors
- Success Alert (green) with "Redirecting to login..." message
- Delete Account Card with `border-destructive` class
- Destructive CardTitle (`text-destructive`)
- Confirmation text input with code-styled hint
- Destructive variant Button for delete action
- No `<style>` block — all styling via Tailwind utility classes

### shadcn-vue components used
- Card, CardHeader, CardTitle, CardContent
- Button (default + destructive variant)
- Input (password + text types)
- Label
- Alert, AlertDescription

### `frontend/src/views/__tests__/AccountView.spec.ts`
- Updated selectors for new DOM structure (h3 headings, `[role="alert"]`)
- Tests for destructive border class, destructive heading class

## Verification

| Check | Result |
|-------|--------|
| Type-check | ✅ Clean |
| Lint | ✅ 0 errors (430 pre-existing JSDoc warnings) |
| Tests | ✅ 416 passed, 35 files |
| Coverage | ✅ 93.84% stmts, 91.44% branches (above 90% threshold) |

## Acceptance Criteria

- [x] Three Card sections: Account Info, Change Password, Delete Account
- [x] Account Info shows user email
- [x] Change Password form works identically — success redirects to login after 2s
- [x] Delete Account form works identically — confirmation text, destructive button
- [x] Danger zone Card has red/destructive border (`border-destructive`)
- [x] Error and success messages use Alert components
- [x] Existing AccountView tests updated and passing
- [x] No scoped `<style>` block

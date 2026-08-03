# RES-58: Delete resume — backend endpoint + frontend delete button

## Summary

Implemented the ability for users to delete their resumes from the dashboard.

## Changes

### Backend
- **`resumes.service.ts`**: Added `delete(id, userId)` method that checks ownership (throws `NotFoundException` for non-existent or unauthorized) and deletes via Prisma (cascade handles children via `onDelete: Cascade`)
- **`resumes.controller.ts`**: Added `@Delete(':id')` endpoint with `@HttpCode(204)`, guarded by `AuthGuard`
- **`resumes.service.spec.ts`**: Added test for `delete` on `MockPrisma` interface; 4 test cases: successful delete, not-found, unauthorized, and verify no delete call when check fails
- **`resumes.controller.spec.ts`**: 4 test cases for DELETE endpoint: 204 success, 404 not found, 404 other user, 401 unauthenticated

### Frontend
- **`ConfirmModal.vue`** (new): Shared reusable confirmation modal using reka-ui Dialog components. Props: modelValue, title, description, confirmLabel, cancelLabel, variant (default/destructive). Emits: confirm, cancel. Fully themed with dark mode support.
- **`DashboardView.vue`**: Added trash icon button on each resume card, wired to ConfirmModal with destructive variant. On confirm, calls `api.del()` and removes from local array. Error state handled with alert.
- **`DashboardView.spec.ts`**: Replaced old "does not show delete button" test with 5 new tests: trash icon visibility, modal opens on click, delete on confirm, cancel without delete, and error alert on failure. Tests use component props/emits to avoid DialogPortal teleport issues.

## Test Results
- Backend: 21/22 suites pass (1 pre-existing failure in prisma-schema.spec.ts requiring DATABASE_URL), 182 tests pass
- Frontend: 35 suites pass, 420 tests pass
- Type-check: both backend and frontend pass
- Lint: both pass (pre-existing warnings only)

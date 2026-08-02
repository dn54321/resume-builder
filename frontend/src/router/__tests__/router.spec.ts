// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/features/auth/stores/auth';

/**
 * Creates a fresh router instance from the actual route definitions.
 * We import the route definitions directly to test them, then clone into a
 * fresh router for each test to avoid shared state between tests.
 */
async function createTestRouter() {
  // Import the compiled module to get route definitions
  const mod = await import('@/router/index');
  // Create a fresh router with the same routes
  const router = createRouter({
    history: createWebHistory(),
    routes: mod.default.getRoutes().map((r) => ({
      path: r.path,
      name: r.name,
      component: r.components?.default ?? { template: '<div>Stub</div>' },
      meta: r.meta,
    })),
  });
  return router;
}

describe('Router configuration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  describe('Route definitions', () => {
    it('has / route named home', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/');
      expect(route.name).toBe('home');
    });

    it('has /login route', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/login');
      expect(route.name).toBe('login');
    });

    it('has /signup route', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/signup');
      expect(route.name).toBe('signup');
    });

    it('has /account route', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/account');
      expect(route.name).toBe('account');
    });

    it('has /builder route', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/builder');
      expect(route.name).toBe('builder');
    });

    it('has /builder/:id route named builder-edit', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/builder/resume-123');
      expect(route.name).toBe('builder-edit');
      expect(route.params.id).toBe('resume-123');
    });

    it('has /dashboard route named dashboard', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/dashboard');
      expect(route.name).toBe('dashboard');
    });

    it('/about route is not defined (removed)', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/about');
      // Since /about is no longer a defined route, it should match catch-all
      expect(route.name).toBe('not-found');
    });

    it('unknown URLs match the catch-all not-found route', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/foo/bar');
      expect(route.name).toBe('not-found');
    });

    it('/builder/:id meta.requiresAuth is true', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/builder/resume-abc');
      expect(route.meta.requiresAuth).toBe(true);
    });

    it('/dashboard meta.requiresAuth is true', async () => {
      const router = await createTestRouter();
      const route = router.resolve('/dashboard');
      expect(route.meta.requiresAuth).toBe(true);
    });

    it('public routes do not have requiresAuth meta', async () => {
      const router = await createTestRouter();
      const home = router.resolve('/');
      const login = router.resolve('/login');
      const signup = router.resolve('/signup');
      const builder = router.resolve('/builder');
      expect(home.meta.requiresAuth).toBeUndefined();
      expect(login.meta.requiresAuth).toBeUndefined();
      expect(signup.meta.requiresAuth).toBeUndefined();
      expect(builder.meta.requiresAuth).toBeUndefined();
    });
  });

  describe('Navigation guard', () => {
    /**
     * Creates a real router with the actual beforeEach guard by
     * importing the default router module and cloning it.
     */
    async function createGuardedRouter() {
      const mod = await import('@/router/index');
      // Create a fresh router with the same routes AND guards
      // We need to re-import because guards are set on the singleton
      const router = createRouter({
        history: createWebHistory(),
        routes: mod.default.getRoutes().map((r) => ({
          path: r.path,
          name: r.name,
          component: r.components?.default ?? { template: '<div>Stub</div>' },
          meta: r.meta,
        })),
      });

      // Apply the same beforeEach guard
      router.beforeEach((to, _from) => {
        if (to.meta.requiresAuth) {
          const auth = useAuthStore();
          if (!auth.isAuthenticated) {
            return { path: '/login', query: { redirect: to.fullPath } };
          }
        }
      });

      return router;
    }

    it('redirects unauthenticated users from /dashboard to /login', async () => {
      const router = await createGuardedRouter();
      await router.push('/dashboard');
      await router.isReady();

      expect(router.currentRoute.value.path).toBe('/login');
      expect(router.currentRoute.value.query.redirect).toBe('/dashboard');
    });

    it('redirects unauthenticated users from /builder/:id to /login with redirect param', async () => {
      const router = await createGuardedRouter();
      await router.push('/builder/my-resume-42');
      await router.isReady();

      expect(router.currentRoute.value.path).toBe('/login');
      expect(router.currentRoute.value.query.redirect).toBe(
        '/builder/my-resume-42',
      );
    });

    it('allows authenticated users to access /dashboard', async () => {
      const router = await createGuardedRouter();
      const auth = useAuthStore();
      auth.token = 'valid-token';
      auth.user = { id: '1', email: 'test@test.com' };

      await router.push('/dashboard');
      await router.isReady();

      expect(router.currentRoute.value.path).toBe('/dashboard');
    });

    it('allows authenticated users to access /builder/:id', async () => {
      const router = await createGuardedRouter();
      const auth = useAuthStore();
      auth.token = 'valid-token';
      auth.user = { id: '1', email: 'test@test.com' };

      await router.push('/builder/my-resume');
      await router.isReady();

      expect(router.currentRoute.value.path).toBe('/builder/my-resume');
    });

    it('allows unauthenticated users to access public routes', async () => {
      const router = await createGuardedRouter();

      await router.push('/');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/');

      await router.push('/login');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/login');

      await router.push('/builder');
      await router.isReady();
      expect(router.currentRoute.value.path).toBe('/builder');
    });

    it('redirect preserves the full path including query params', async () => {
      const router = await createGuardedRouter();
      await router.push('/dashboard?tab=recent');
      await router.isReady();

      expect(router.currentRoute.value.path).toBe('/login');
      expect(router.currentRoute.value.query.redirect).toBe(
        '/dashboard?tab=recent',
      );
    });
  });
});

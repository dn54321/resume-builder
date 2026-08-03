import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { useAuthStore } from '@/features/auth/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../features/auth/LoginView.vue'),
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('../features/auth/SignupView.vue'),
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
    },
    {
      path: '/builder',
      name: 'builder',
      component: () => import('../features/builder/ResumeBuilder.vue'),
    },
    {
      path: '/builder/:id',
      name: 'builder-edit',
      component: () => import('../features/builder/ResumeBuilder.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
});

router.beforeEach(async (to, _from) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore();
    // Wait for session check to complete (token in localStorage but user not loaded yet)
    if (!auth.authReady) {
      await auth.checkSession();
    }
    if (!auth.isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }
});

export default router;

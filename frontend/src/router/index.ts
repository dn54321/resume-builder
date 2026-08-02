import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

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
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
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
  ],
});

export default router;

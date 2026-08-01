// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '@/views/LoginView.vue';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/login', name: 'login', component: LoginView },
  ],
});

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it('renders the login form', () => {
    const wrapper = mount(LoginView, {
      global: { plugins: [router] },
    });

    expect(wrapper.find('h1').text()).toBe('Log In');
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('shows error message on failed login', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid email or password' }),
    });

    const wrapper = mount(LoginView, {
      global: { plugins: [router] },
    });

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    await wrapper.find('input[type="password"]').setValue('wrong');
    await wrapper.find('form').trigger('submit.prevent');

    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(wrapper.find('.error-message').text()).toBe(
      'Invalid email or password',
    );
  });

  it('links to signup page', () => {
    const wrapper = mount(LoginView, {
      global: { plugins: [router] },
    });

    const signupLink = wrapper.find('a[href="/signup"]');
    expect(signupLink.exists()).toBe(true);
  });

  it('sets session and navigates home on successful login', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          user: { id: 'user-1', email: 'test@example.com' },
          sessionToken: 'token-abc',
        }),
    });

    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(LoginView, {
      global: { plugins: [router] },
    });

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    await wrapper.find('input[type="password"]').setValue('password123');
    await wrapper.find('form').trigger('submit.prevent');

    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(true);
    expect(store.user!.email).toBe('test@example.com');
    expect(pushSpy).toHaveBeenCalledWith({ name: 'home' });
  });
});

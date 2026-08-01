// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import SignupView from '@/views/SignupView.vue';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/signup', name: 'signup', component: SignupView },
  ],
});

describe('SignupView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it('renders the signup form', () => {
    const wrapper = mount(SignupView, {
      global: { plugins: [router] },
    });

    expect(wrapper.find('h1').text()).toBe('Sign Up');
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.findAll('input[type="password"]').length).toBe(2);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('shows error when passwords do not match', async () => {
    const wrapper = mount(SignupView, {
      global: { plugins: [router] },
    });

    await wrapper.find('input[type="email"]').setValue('test@example.com');
    const passwordInputs = wrapper.findAll('input[type="password"]');
    await passwordInputs[0]!.setValue('password123');
    await passwordInputs[1]!.setValue('different');
    await wrapper.find('form').trigger('submit.prevent');

    await wrapper.vm.$nextTick();

    expect(wrapper.find('.error-message').text()).toBe(
      'Passwords do not match',
    );
  });

  it('shows error when signup fails with conflict', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          message: 'A user with this email already exists',
        }),
    });

    const wrapper = mount(SignupView, {
      global: { plugins: [router] },
    });

    await wrapper.find('input[type="email"]').setValue('existing@example.com');
    const passwordInputs = wrapper.findAll('input[type="password"]');
    await passwordInputs[0]!.setValue('password123');
    await passwordInputs[1]!.setValue('password123');
    await wrapper.find('form').trigger('submit.prevent');

    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(wrapper.find('.error-message').text()).toBe(
      'A user with this email already exists',
    );
  });

  it('sets session and navigates home on successful signup', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          user: { id: 'user-1', email: 'new@example.com' },
          sessionToken: 'token-abc',
        }),
    });

    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(SignupView, {
      global: { plugins: [router] },
    });

    await wrapper.find('input[type="email"]').setValue('new@example.com');
    const passwordInputs = wrapper.findAll('input[type="password"]');
    await passwordInputs[0]!.setValue('password123');
    await passwordInputs[1]!.setValue('password123');
    await wrapper.find('form').trigger('submit.prevent');

    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(true);
    expect(store.user!.email).toBe('new@example.com');
    expect(pushSpy).toHaveBeenCalledWith({ name: 'home' });
  });

  it('links to login page', () => {
    const wrapper = mount(SignupView, {
      global: { plugins: [router] },
    });

    const loginLink = wrapper.find('a[href="/login"]');
    expect(loginLink.exists()).toBe(true);
  });
});

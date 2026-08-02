import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import NotFoundView from '@/views/NotFoundView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
});

describe('NotFoundView', () => {
  it('renders the 404 code', () => {
    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    expect(wrapper.text()).toContain('404');
  });

  it('renders the page not found heading', () => {
    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    expect(wrapper.find('h1').text()).toBe('Page not found');
  });

  it('renders the description text', () => {
    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    expect(wrapper.text()).toContain(
      "The page you're looking for doesn't exist or has been moved.",
    );
  });

  it('renders a "Go home" button linking to /', () => {
    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Go home');
    expect(link.attributes('href')).toBe('/');
  });

  it('is rendered when navigating to an unmatched route', async () => {
    await router.push('/nonexistent-page');
    await router.isReady();

    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    expect(wrapper.find('h1').text()).toBe('Page not found');
  });

  it('is rendered when navigating to a deeply nested unmatched route', async () => {
    await router.push('/foo/bar/baz');
    await router.isReady();

    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    expect(wrapper.find('h1').text()).toBe('Page not found');
  });

  it('has the go home button that navigates to /', () => {
    const wrapper = mount(NotFoundView, {
      global: { plugins: [router] },
    });

    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('/');
  });
});

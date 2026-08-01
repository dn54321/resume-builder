// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('starts with no authenticated user', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.sessionToken).toBeNull();
  });

  it('sets session on login and stores token in localStorage', () => {
    const store = useAuthStore();
    const user = { id: 'user-1', email: 'test@example.com' };

    store.setSession(user, 'session-token-abc');

    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toEqual(user);
    expect(store.sessionToken).toBe('session-token-abc');
    expect(localStorage.getItem('session_token')).toBe('session-token-abc');
  });

  it('clears session on logout', () => {
    const store = useAuthStore();
    store.setSession({ id: 'user-1', email: 'test@example.com' }, 'token');

    store.clearSession();

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.sessionToken).toBeNull();
    expect(localStorage.getItem('session_token')).toBeNull();
  });

  it('restores token from localStorage', () => {
    localStorage.setItem('session_token', 'stored-token');
    const store = useAuthStore();
    expect(store.sessionToken).toBe('stored-token');
  });

  it('checkSession with valid token sets user', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: 'user-1', email: 'test@example.com' } }),
    });

    const store = useAuthStore();
    store.setSession({ id: 'temp', email: 'temp@example.com' }, 'valid-token');
    store.user = null;

    await store.checkSession('http://localhost:3000');

    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toEqual({ id: 'user-1', email: 'test@example.com' });
  });

  it('checkSession clears session on invalid token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ user: null }),
    });

    const store = useAuthStore();
    store.setSession({ id: 'temp', email: 'temp@example.com' }, 'invalid-token');

    await store.checkSession('http://localhost:3000');

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
  });
});

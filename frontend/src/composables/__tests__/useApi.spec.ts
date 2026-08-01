// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useApi } from '@/composables/useApi';
import { useAuthStore } from '@/stores/auth';

describe('useApi', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it('makes a GET request and returns data', async () => {
    const mockData = { message: 'success' };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const { apiRequest } = useApi();
    const result = await apiRequest<{ message: string }>('/test');

    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
    expect(result.status).toBe(200);
  });

  it('returns error for non-ok response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Bad request' }),
    });

    const { apiRequest } = useApi();
    const result = await apiRequest<unknown>('/test');

    expect(result.data).toBeNull();
    expect(result.error).toBe('Bad request');
    expect(result.status).toBe(400);
  });

  it('attaches auth header when authenticated is true', async () => {
    const authStore = useAuthStore();
    authStore.setSession({ id: 'user-1', email: 'test@example.com' }, 'my-token');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { apiRequest } = useApi();
    await apiRequest('/secured', { authenticated: true });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });

  it('handles network errors gracefully', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );

    const { apiRequest } = useApi();
    const result = await apiRequest<unknown>('/test');

    expect(result.data).toBeNull();
    expect(result.error).toBe('Network error');
    expect(result.status).toBe(0);
  });

  it('sends body as JSON for POST requests', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'new-item' }),
    });

    const { apiRequest } = useApi();
    await apiRequest('/items', {
      method: 'POST',
      body: { name: 'test' },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }),
    );
  });
});

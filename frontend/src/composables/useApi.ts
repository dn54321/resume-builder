import { useAuthStore } from '@/stores/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  authenticated?: boolean;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, authenticated = false } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authenticated) {
    const authStore = useAuthStore();
    const token = authStore.sessionToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      return { data: null, error: null, status: 204 };
    }

    const json = (await response.json()) as T;

    if (!response.ok) {
      const errorMessage =
        (json as Record<string, unknown>)['message'] !== undefined
          ? String((json as Record<string, unknown>)['message'])
          : `Request failed with status ${response.status}`;
      return { data: null, error: errorMessage, status: response.status };
    }

    return { data: json, error: null, status: response.status };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Network error';
    return { data: null, error: errorMessage, status: 0 };
  }
}

export function useApi() {
  return { apiRequest };
}

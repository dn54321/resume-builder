interface ApiError {
  status: number
  message: string
  errors?: Record<string, string[]>
}

class ApiRequestError extends Error {
  readonly status: number
  readonly errors?: Record<string, string[]>

  constructor({ status, message, errors }: ApiError) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.errors = errors
  }
}

function getBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set')
  }
  return base.replace(/\/+$/, '')
}

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}${path}`
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let body: { message?: string; errors?: Record<string, string[]> }
    try {
      body = await response.json()
    } catch {
      body = { message: response.statusText }
    }
    throw new ApiRequestError({
      status: response.status,
      message: body.message || response.statusText,
      errors: body.errors,
    })
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export function useApi() {
  return {
    get<T>(path: string, init?: RequestInit): Promise<T> {
      return request<T>(path, { ...init, method: 'GET' })
    },

    post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
      return request<T>(path, {
        ...init,
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    },

    put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
      return request<T>(path, {
        ...init,
        method: 'PUT',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    },

    del<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
      return request<T>(path, {
        ...init,
        method: 'DELETE',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    },
  }
}

export { ApiRequestError }
export type { ApiError }

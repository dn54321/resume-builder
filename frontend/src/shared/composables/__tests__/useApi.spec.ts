import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

describe('useApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('get', () => {
    it('makes a GET request and returns parsed JSON', async () => {
      const mockData = { id: 1, name: 'test' }
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response)

      const { get } = useApi()
      const result = await get('/api/test')

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('includes credentials: include so cookies are sent', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      const { get } = useApi()
      await get('/api/test')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          credentials: 'include',
        }),
      )
    })

    it('throws ApiRequestError on non-ok response', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Resource not found' }),
      } as Response)

      const { get } = useApi()

      await expect(get('/api/test')).rejects.toThrow(ApiRequestError)
      await expect(get('/api/test')).rejects.toMatchObject({
        status: 404,
        message: 'Resource not found',
      })
    })

    it('falls back to statusText when response.json() throws on error', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response)

      const { get } = useApi()

      await expect(get('/api/test')).rejects.toThrow(ApiRequestError)
      await expect(get('/api/test')).rejects.toMatchObject({
        status: 500,
        message: 'Internal Server Error',
      })
    })

    it('handles 204 No Content by returning undefined', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('should not be called')),
      } as Response)

      const { get } = useApi()
      const result = await get('/api/test')

      expect(result).toBeUndefined()
    })
  })

  describe('post', () => {
    it('makes a POST request with JSON body and credentials', async () => {
      const mockData = { success: true }
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockData),
      } as Response)

      const { post } = useApi()
      const body = { name: 'new item' }
      const result = await post('/api/test', body)

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          credentials: 'include',
        }),
      )
    })

    it('does not include body when undefined', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      const { post } = useApi()
      await post('/api/test', undefined)

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1]!.body).toBeUndefined()
    })
  })

  describe('put', () => {
    it('makes a PUT request with JSON body and credentials', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      const { put } = useApi()
      await put('/api/test', { name: 'updated' })

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
        }),
      )
    })
  })

  describe('del', () => {
    it('makes a DELETE request with credentials', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      const { del } = useApi()
      await del('/api/test')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/test',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
        }),
      )
    })

    it('includes body when provided', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      const { del } = useApi()
      await del('/api/test', { reason: 'cleanup' })

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
      const body = JSON.parse(callArgs[1]!.body as string)
      expect(body).toEqual({ reason: 'cleanup' })
    })
  })

  describe('error handling', () => {
    it('returns ApiError.errors when present in response', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: () =>
          Promise.resolve({
            message: 'Validation failed',
            errors: { email: ['Invalid email'] },
          }),
      } as Response)

      const { post } = useApi()

      await expect(post('/api/test', {})).rejects.toMatchObject({
        status: 422,
        message: 'Validation failed',
        errors: { email: ['Invalid email'] },
      })
    })

    it('no longer sends Authorization header (cookie-based auth)', async () => {
      global.fetch = vi.fn<typeof global.fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      const { get } = useApi()
      await get('/api/test')

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
      const headers = callArgs[1]!.headers as Record<string, string>
      // Should not have Authorization header — cookies handle auth
      expect(headers['Authorization']).toBeUndefined()
    })
  })
})

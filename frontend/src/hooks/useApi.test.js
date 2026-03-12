import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test fetchApi which is not exported directly,
// but is used by the `api` object. We test through `api`.

// Mock fetch globally
global.fetch = vi.fn();

// Mock import.meta.env
vi.stubEnv('VITE_API_URL', 'http://localhost:3001/api');

describe('useApi - api helper functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('sends GET request with correct URL', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const { api } = await import('./useApi.js');
    const result = await api.healthCheck();

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/health');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(result).toEqual({ status: 'ok' });
  });

  it('sends POST request with body', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 'abc123' }),
    });

    const { api } = await import('./useApi.js');
    await api.login('user@test.com', 'password123');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      email: 'user@test.com',
      password: 'password123',
    });
  });

  it('injects Authorization header when token exists in localStorage', async () => {
    localStorage.setItem('sap-spektra-auth', JSON.stringify({ token: 'my-token' }));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const { api } = await import('./useApi.js');
    await api.getSystems();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer my-token');
  });

  it('does not inject Authorization header when no token', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const { api } = await import('./useApi.js');
    await api.getSystems();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('throws error on non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    const { api } = await import('./useApi.js');
    await expect(api.healthCheck()).rejects.toThrow('Unauthorized');
  });

  it('throws generic error when response body has no message', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { api } = await import('./useApi.js');
    await expect(api.healthCheck()).rejects.toThrow('Error 500');
  });

  it('handles malformed auth in localStorage gracefully', async () => {
    localStorage.setItem('sap-spektra-auth', 'not-valid-json');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const { api } = await import('./useApi.js');
    await api.healthCheck();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
    // Malformed JSON should have been removed
    expect(localStorage.getItem('sap-spektra-auth')).toBeNull();
  });
});

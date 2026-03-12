import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Reset modules between tests so fetchApi picks up fresh localStorage / fetch
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: successful JSON response
function jsonOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// Helper: error JSON response
function jsonError(status: number, body: unknown = {}) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ── useApi hook tests ────────────────────────────────────────────────────────

describe('useApi hook', () => {
  it('returns loading=false and error=null initially', async () => {
    const { useApi } = await import('../useApi');
    const { result } = renderHook(() => useApi());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading=true during a request and loading=false after', async () => {
    let resolveFetch!: (v: Response) => void;
    mockFetch.mockReturnValue(new Promise((r) => { resolveFetch = r; }));

    const { useApi } = await import('../useApi');
    const { result } = renderHook(() => useApi());

    let requestPromise: Promise<unknown>;
    act(() => {
      requestPromise = result.current.request('/test');
    });

    // loading should be true while request is in-flight
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(jsonOk({ ok: true }));
      await requestPromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error message on failed request and re-throws', async () => {
    mockFetch.mockResolvedValue(jsonError(500, { message: 'Internal fail' }));

    const { useApi } = await import('../useApi');
    const { result } = renderHook(() => useApi());

    await act(async () => {
      await expect(result.current.request('/broken')).rejects.toThrow('Internal fail');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Internal fail');
  });

  it('allows clearing the error via setError', async () => {
    mockFetch.mockResolvedValue(jsonError(400, { error: 'Bad request' }));

    const { useApi } = await import('../useApi');
    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.request('/fail').catch(() => {});
    });
    expect(result.current.error).toBe('Bad request');

    act(() => result.current.setError(null));
    expect(result.current.error).toBeNull();
  });

  it('returns parsed JSON on success', async () => {
    const payload = { data: [1, 2, 3] };
    mockFetch.mockResolvedValue(jsonOk(payload));

    const { useApi } = await import('../useApi');
    const { result } = renderHook(() => useApi());

    let res: unknown;
    await act(async () => {
      res = await result.current.request('/data');
    });
    expect(res).toEqual(payload);
  });
});

// ── fetchApi internals (JWT, headers, 401 redirect) ─────────────────────────

describe('fetchApi – JWT handling', () => {
  it('sends Authorization header when token is present in localStorage', async () => {
    localStorage.setItem('sap-spektra-auth', JSON.stringify({ token: 'my-jwt-token' }));
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));

    const { api } = await import('../useApi');
    await api.healthCheck();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer my-jwt-token');
  });

  it('does NOT send Authorization header when localStorage is empty', async () => {
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));

    const { api } = await import('../useApi');
    await api.healthCheck();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('removes corrupted auth from localStorage gracefully', async () => {
    localStorage.setItem('sap-spektra-auth', '{bad-json');
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));

    const { api } = await import('../useApi');
    await api.healthCheck();

    expect(localStorage.getItem('sap-spektra-auth')).toBeNull();
  });

  it('redirects to /login and clears auth on 401 response', async () => {
    localStorage.setItem('sap-spektra-auth', JSON.stringify({ token: 'expired' }));
    mockFetch.mockResolvedValue(jsonError(401));

    // Capture location change
    const originalHref = window.location.href;
    const hrefSetter = vi.fn();
    // Replace window.location entirely, then override href with getter/setter
    Object.defineProperty(window, 'location', {
      value: { ...window.location },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      get: () => originalHref,
      configurable: true,
    });

    const { api } = await import('../useApi');
    await expect(api.me()).rejects.toThrow('Sesión expirada');

    expect(localStorage.getItem('sap-spektra-auth')).toBeNull();
    expect(hrefSetter).toHaveBeenCalledWith('/login');
  });

  it('falls back to generic error message when body has no message', async () => {
    mockFetch.mockResolvedValue(jsonError(403, {}));

    const { api } = await import('../useApi');
    await expect(api.me()).rejects.toThrow('Error 403');
  });
});

// ── api.* endpoint functions ─────────────────────────────────────────────────

describe('api endpoint functions', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));
  });

  it('api.login sends POST with email and password', async () => {
    const { api } = await import('../useApi');
    await api.login('admin@test.com', 's3cret');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'admin@test.com', password: 's3cret' });
  });

  it('api.register sends POST with data', async () => {
    const { api } = await import('../useApi');
    const data = { email: 'new@test.com', password: 'pass', name: 'New User' };
    await api.register(data);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(data);
  });

  it('api.getSystems sends GET to /systems', async () => {
    const { api } = await import('../useApi');
    await api.getSystems();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/systems');
    expect(init.method).toBeUndefined(); // GET is default
  });

  it('api.createSystem sends POST with body', async () => {
    const { api } = await import('../useApi');
    const system = { sid: 'PRD', type: 'S/4HANA' };
    await api.createSystem(system);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/systems');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(system);
  });

  it('api.updateSystem sends PATCH to /systems/:id', async () => {
    const { api } = await import('../useApi');
    await api.updateSystem('sys-1', { sid: 'QAS' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/systems/sys-1');
    expect(init.method).toBe('PATCH');
  });

  it('api.deleteSystem sends DELETE to /systems/:id', async () => {
    const { api } = await import('../useApi');
    await api.deleteSystem('sys-2');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/systems/sys-2');
    expect(init.method).toBe('DELETE');
  });

  it('api.getAlerts builds query string from filters', async () => {
    const { api } = await import('../useApi');
    await api.getAlerts({ status: 'open', level: 'critical', systemId: 'sys-1' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('status=open');
    expect(url).toContain('level=critical');
    expect(url).toContain('systemId=sys-1');
  });

  it('api.getAlerts sends no query string when filters are empty', async () => {
    const { api } = await import('../useApi');
    await api.getAlerts({});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/alerts$/);
  });

  it('api.getEvents builds query string including limit', async () => {
    const { api } = await import('../useApi');
    await api.getEvents({ level: 'error', limit: 50 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('level=error');
    expect(url).toContain('limit=50');
  });

  it('api.acknowledgeAlert sends PATCH', async () => {
    const { api } = await import('../useApi');
    await api.acknowledgeAlert('alert-5');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/alerts/alert-5/acknowledge');
    expect(init.method).toBe('PATCH');
  });

  it('api.executeRunbook sends POST with systemId and dryRun', async () => {
    const { api } = await import('../useApi');
    await api.executeRunbook('rb-1', 'sys-1', true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/runbooks/rb-1/execute');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ systemId: 'sys-1', dryRun: true });
  });

  it('api.getOperations builds query string from filters', async () => {
    const { api } = await import('../useApi');
    await api.getOperations({ status: 'running', type: 'backup', systemId: 'sys-2' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('status=running');
    expect(url).toContain('type=backup');
    expect(url).toContain('systemId=sys-2');
  });

  it('api.triggerFailover sends PATCH to /ha/:systemId/failover', async () => {
    const { api } = await import('../useApi');
    await api.triggerFailover('sys-ha');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/ha/sys-ha/failover');
    expect(init.method).toBe('PATCH');
  });

  it('api.getHostMetrics defaults hours to 24', async () => {
    const { api } = await import('../useApi');
    await api.getHostMetrics('host-1');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/metrics/hosts/host-1?hours=24');
  });

  it('api.getHostMetrics accepts custom hours', async () => {
    const { api } = await import('../useApi');
    await api.getHostMetrics('host-1', 48);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/metrics/hosts/host-1?hours=48');
  });

  it('api.chat sends POST with message and context', async () => {
    const { api } = await import('../useApi');
    await api.chat('What is SAP?', { systemId: 's1' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ message: 'What is SAP?', context: { systemId: 's1' } });
  });

  it('api.getAuditLog builds query string from filters', async () => {
    const { api } = await import('../useApi');
    await api.getAuditLog({ severity: 'high', action: 'login', limit: 10 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('severity=high');
    expect(url).toContain('action=login');
    expect(url).toContain('limit=10');
  });

  it('api.getBreaches appends systemId when provided', async () => {
    const { api } = await import('../useApi');
    await api.getBreaches('sys-9');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/metrics/breaches?systemId=sys-9');
  });

  it('api.getBreaches omits query string when systemId is falsy', async () => {
    const { api } = await import('../useApi');
    await api.getBreaches(undefined);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/metrics\/breaches$/);
  });

  it('api.createApiKey sends POST with name', async () => {
    const { api } = await import('../useApi');
    await api.createApiKey('my-key');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/settings/api-keys');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'my-key' });
  });

  it('api.revokeApiKey sends PATCH to correct URL', async () => {
    const { api } = await import('../useApi');
    await api.revokeApiKey('key-42');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/settings/api-keys/key-42/revoke');
    expect(init.method).toBe('PATCH');
  });

  it('api.getSystemTrends defaults days to 7', async () => {
    const { api } = await import('../useApi');
    await api.getSystemTrends('sys-1');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/analytics/systems/sys-1/trends?days=7');
  });

  it('api.getApprovals appends status when provided', async () => {
    const { api } = await import('../useApi');
    await api.getApprovals('pending');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/approvals?status=pending');
  });
});

// ── fetchApi body serialization ──────────────────────────────────────────────

describe('fetchApi body serialization', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));
  });

  it('stringifies object bodies as JSON', async () => {
    const { api } = await import('../useApi');
    await api.createSystem({ sid: 'PRD' });

    const [, init] = mockFetch.mock.calls[0];
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body)).toEqual({ sid: 'PRD' });
  });

  it('passes string bodies through unchanged', async () => {
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));
    const { useApi } = await import('../useApi');
    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.request('/raw', { method: 'POST', body: '{"raw":true}' });
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe('{"raw":true}');
  });

  it('always sets Content-Type to application/json', async () => {
    const { api } = await import('../useApi');
    await api.healthCheck();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
  });
});

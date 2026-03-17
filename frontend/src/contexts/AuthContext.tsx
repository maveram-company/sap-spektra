import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import config from '../config';
import { api } from '../hooks/useApi';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  token: string;
  organizationId?: string;
  organization: { id: string; name: string; plan?: string };
  exp: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  isEscalation: boolean;
  isViewer: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'sap-spektra-auth';

function isTokenValid(user: AuthUser | null): boolean {
  if (!user?.exp || typeof user.exp !== 'number') return false;
  return Date.now() / 1000 < user.exp;
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function getInitialUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AuthUser;
      if (isTokenValid(parsed)) return parsed;
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

// Exporting both AuthProvider (component) and useAuth (hook) from the same file
// triggers react-refresh/only-export-components. The disable is necessary because
// the hook must live alongside its context provider for encapsulation.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getInitialUser);

  const login = useCallback(async (username: string, password: string): Promise<AuthUser> => {
    // ── Primary path: real backend auth (POST /api/auth/login) ──
    if (!config.features.demoMode) {
      const raw = await api.login(username, password) as { accessToken: string; user: { id: string; email: string; name: string; role: string; organizationId: string; organizationName?: string } };
      const result = raw;
      const payload = parseJwt(result.accessToken);
      const authUser: AuthUser = {
        id: result.user.id,
        username: result.user.email,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        token: result.accessToken,
        organizationId: result.user.organizationId,
        organization: { id: result.user.organizationId, name: result.user.organizationName || 'Organization' },
        exp: (payload?.exp as number) || Math.floor(Date.now() / 1000) + 86400,
      };
      setUser(authUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
      return authUser;
    }

    // ── Demo path: config.features.demoMode=true — no backend needed ──
    const demoUser: AuthUser = {
      id: `demo-${Date.now()}`,
      username,
      email: `${username}@demo.spektra.com`,
      name: username.charAt(0).toUpperCase() + username.slice(1),
      role: 'admin',
      token: `demo-token-${Date.now()}`,
      organization: { id: 'org-demo', name: 'Demo Organization', plan: 'professional' },
      exp: Math.floor(Date.now() / 1000) + 86400,
    };
    setUser(demoUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoUser));
    return demoUser;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const levels: Record<string, number> = { admin: 40, escalation: 30, operator: 20, viewer: 10 };

  const value: AuthContextValue = {
    user,
    loading: false,
    login,
    logout,
    isAuthenticated: !!user && isTokenValid(user),
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'operator',
    isEscalation: user?.role === 'escalation',
    isViewer: user?.role === 'viewer',
    hasRole: (role: string) => {
      return (levels[user?.role ?? ''] || 0) >= (levels[role] || 0);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

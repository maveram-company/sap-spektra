import { createContext, useContext, useState, useCallback } from 'react';
import config from '../config';
import { api } from '../hooks/useApi';

const AuthContext = createContext(null);

const STORAGE_KEY = 'sap-spektra-auth';

function isTokenValid(user) {
  if (!user?.exp || typeof user.exp !== 'number') return false;
  return Date.now() / 1000 < user.exp;
}

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function getInitialUser() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isTokenValid(parsed)) return parsed;
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getInitialUser);

  const login = useCallback(async (username, password) => {
    // ── Primary path: real backend auth (POST /api/auth/login) ──
    if (!config.features.demoMode) {
      const result = await api.login(username, password);
      const payload = parseJwt(result.accessToken);
      const authUser = {
        id: result.user.id,
        username: result.user.email,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        token: result.accessToken,
        organizationId: result.user.organizationId,
        organization: { id: result.user.organizationId, name: result.user.organizationName || 'Organization' },
        exp: payload?.exp || Math.floor(Date.now() / 1000) + 86400,
      };
      setUser(authUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
      return authUser;
    }

    // ── Demo path: config.features.demoMode=true — no backend needed ──
    const demoUser = {
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

  const value = {
    user,
    loading: false,
    login,
    logout,
    isAuthenticated: !!user && isTokenValid(user),
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'operator',
    isEscalation: user?.role === 'escalation',
    isViewer: user?.role === 'viewer',
    hasRole: (role) => {
      const levels = { admin: 40, escalation: 30, operator: 20, viewer: 10 };
      return (levels[user?.role] || 0) >= (levels[role] || 0);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

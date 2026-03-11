import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'sap-maveram-auth';

function isTokenValid(user) {
  if (!user?.exp || typeof user.exp !== 'number') return false;
  return Date.now() / 1000 < user.exp;
}

function getRoleFromUsername(username) {
  const u = username.toLowerCase();
  if (u.includes('admin')) return 'admin';
  if (u.includes('oper')) return 'operator';
  if (u.includes('escal')) return 'escalation';
  return 'viewer';
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

  const login = useCallback(async (username) => {
    const role = getRoleFromUsername(username);
    const demoUser = {
      id: `demo-${Date.now()}`,
      username,
      email: `${username}@demo.maveram.com`,
      name: username.charAt(0).toUpperCase() + username.slice(1),
      role,
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

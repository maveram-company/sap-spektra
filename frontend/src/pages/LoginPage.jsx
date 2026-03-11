import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Zap, Eye, EyeOff, Shield, BarChart3, Bot, Clock } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) { setError('Ingresa tu usuario'); return; }
    setError('');
    setLoading(true);
    try {
      await login(username);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Shield, label: 'Monitoreo 24/7' },
    { icon: Bot, label: 'IA Integrada' },
    { icon: BarChart3, label: 'Automatización' },
    { icon: Clock, label: 'Setup 25 min' },
  ];

  const demoRoles = ['admin', 'operator', 'escalation', 'viewer'];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: '#030712' }}
    >
      {/* ── Background grid pattern ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Decorative gradient orbs ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-10%',
          left: '-8%',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-12%',
          right: '-8%',
          width: '580px',
          height: '580px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: '40%',
          right: '15%',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      {/* ── Feature pills row ── */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-8 px-4">
        {features.map((feat) => (
          <div
            key={feat.label}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderColor: 'rgba(255,255,255,0.10)',
              color: 'rgba(148,163,184,1)',
            }}
          >
            <feat.icon size={12} style={{ color: '#06b6d4' }} />
            {feat.label}
          </div>
        ))}
      </div>

      {/* ── Login card ── */}
      <div
        className="relative z-10 w-full rounded-2xl shadow-2xl"
        style={{
          maxWidth: '420px',
          margin: '0 16px',
          padding: '40px',
          backgroundColor: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        {/* Logo area */}
        <div className="flex flex-col items-center text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
              boxShadow: '0 0 24px rgba(6,182,212,0.35)',
            }}
          >
            <Zap size={24} className="text-white" />
          </div>

          <h1
            className="text-2xl font-bold bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(90deg, #06b6d4, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SAP Spektra
          </h1>

          <p className="text-xs mt-0.5" style={{ color: 'rgba(100,116,139,1)' }}>
            by Maveram
          </p>

          <p className="text-xs mt-2" style={{ color: 'rgba(100,116,139,1)' }}>
            Mission Control for SAP Operations
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error banner */}
          {error && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.30)',
                color: '#f87171',
              }}
            >
              {error}
            </div>
          )}

          {/* Username field */}
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'rgba(148,163,184,1)' }}
            >
              Usuario
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(226,232,240,1)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(6,182,212,0.50)';
                e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.10)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255,255,255,0.10)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Password field */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'rgba(148,163,184,1)' }}
            >
              Contraseña
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all pr-10"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(226,232,240,1)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(6,182,212,0.50)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.10)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.10)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'rgba(100,116,139,1)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(226,232,240,1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(100,116,139,1)'; }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-all mt-2 flex items-center justify-center gap-2"
            style={{
              background: loading
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(90deg, #0891b2, #7c3aed)',
              boxShadow: loading ? 'none' : '0 0 20px rgba(6,182,212,0.25)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'linear-gradient(90deg, #06b6d4, #8b5cf6)';
                e.currentTarget.style.boxShadow = '0 0 28px rgba(6,182,212,0.40)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'linear-gradient(90deg, #0891b2, #7c3aed)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.25)';
              }
            }}
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Autenticando...
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        {/* Demo mode box */}
        <div
          className="mt-6 rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: 'rgba(226,232,240,1)' }}>
            Modo Demo
          </p>
          <p className="text-xs mb-3" style={{ color: 'rgba(100,116,139,1)' }}>
            Usa cualquier contraseña. El rol se asigna por nombre de usuario:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {demoRoles.map((role) => (
              <button
                key={role}
                onClick={() => { setUsername(role); setPassword('demo'); }}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg transition-all"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(148,163,184,1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(6,182,212,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(6,182,212,0.35)';
                  e.currentTarget.style.color = '#06b6d4';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(6,182,212,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                  e.currentTarget.style.color = 'rgba(148,163,184,1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <p
        className="relative z-10 mt-8 text-xs"
        style={{ color: 'rgba(51,65,85,1)' }}
      >
        © 2026 Maveram. Todos los derechos reservados.
      </p>
    </div>
  );
}

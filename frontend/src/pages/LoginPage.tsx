import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Zap, Eye, EyeOff, Shield, BarChart3, Bot, Clock } from 'lucide-react';

export default function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername) { setError(t('login.errorEmpty')); return; }
    if (trimmedUsername.includes('@') && !EMAIL_REGEX.test(trimmedUsername)) {
      setError(t('login.errorInvalidEmail'));
      return;
    }
    if (!trimmedPassword) { setError(t('login.errorEmptyPassword')); return; }
    if (trimmedPassword.length < 4) {
      setError(t('login.errorPassword'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(trimmedUsername, trimmedPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || t('login.errorAuth'));
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Shield, labelKey: 'login.monitoring' },
    { icon: Bot, labelKey: 'login.aiIntegrated' },
    { icon: BarChart3, labelKey: 'login.automation' },
    { icon: Clock, labelKey: 'login.setup' },
  ];

  const demoAccounts = [
    { label: 'admin', email: 'admin@acme-corp.com', password: 'admin123' },
    { label: 'operator', email: 'operator@acme-corp.com', password: 'admin123' },
    { label: 'escalation', email: 'escalation@acme-corp.com', password: 'admin123' },
    { label: 'viewer', email: 'viewer@acme-corp.com', password: 'admin123' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-gray-950">
      {/* ── Background grid pattern ── */}
      <div className="absolute inset-0 pointer-events-none bg-grid-login" />

      {/* ── Decorative gradient orbs ── */}
      <div
        className="absolute hidden md:block login-orb login-orb-cyan"
        style={{ top: '-10%', left: '-8%', width: '520px', height: '520px' }}
      />
      <div
        className="absolute hidden md:block login-orb login-orb-violet"
        style={{ bottom: '-12%', right: '-8%', width: '580px', height: '580px' }}
      />
      <div
        className="absolute hidden lg:block login-orb login-orb-cyan-sm"
        style={{ top: '40%', right: '15%', width: '300px', height: '300px' }}
      />

      {/* ── Feature pills row ── */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mb-8 px-4">
        {features.map((feat) => (
          <div
            key={feat.labelKey}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-text-secondary"
          >
            <feat.icon size={12} className="text-primary-500" />
            {t(feat.labelKey)}
          </div>
        ))}
      </div>

      {/* ── Login card ── */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 p-10 rounded-2xl shadow-2xl login-card">
        {/* Logo area */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 login-logo-icon">
            <Zap size={24} className="text-white" />
          </div>

          <h1 className="text-2xl font-bold text-gradient">
            SAP Spektra
          </h1>

          <p className="text-xs mt-0.5 text-text-tertiary">
            by Maveram
          </p>

          <p className="text-xs mt-2 text-text-tertiary">
            {t('login.tagline')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400">
              {error}
            </div>
          )}

          {/* Username field */}
          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-medium mb-1.5 text-text-secondary"
            >
              {t('login.username')}
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin@acme-corp.com"
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all login-input"
            />
          </div>

          {/* Password field */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium mb-1.5 text-text-secondary"
            >
              {t('login.password')}
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all pr-10 login-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors login-eye-btn"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-all mt-2 flex items-center justify-center gap-2 login-submit"
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
                {t('login.authenticating')}
              </>
            ) : (
              t('login.submit')
            )}
          </button>
        </form>

        {/* Demo mode box */}
        <div className="mt-6 rounded-xl p-4 bg-white/[0.02] border border-white/10">
          <p className="text-xs font-semibold mb-1 text-text-primary">
            {t('login.testAccounts')}
          </p>
          <p className="text-xs mb-3 text-text-tertiary">
            {t('login.testAccountHint')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {demoAccounts.map((acc) => (
              <button
                key={acc.label}
                onClick={() => { setUsername(acc.email); setPassword(acc.password); }}
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg transition-all login-demo-btn"
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="relative z-10 mt-8 text-xs text-slate-700">
        {t('login.copyright')}
      </p>
    </div>
  );
}

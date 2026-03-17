import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Monitor, CheckCircle, Calendar, BarChart3,
  GitCompare, Shield, Settings, Users,
  Zap, AlertTriangle, List, Bell, Sun, Moon,
  Brain, FileText, BookOpen, Network, Star,
  Activity, Play, Package, Key, Heart, Plug,
  ChevronDown, LogOut, User, Menu, X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlan } from '../../hooks/usePlan';
import { useTenant } from '../../contexts/TenantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { dataService } from '../../services/dataService';
import { createLogger } from '../../lib/logger';

const log = createLogger('TopNav');

// ── Estructura de navegación por secciones ──
const sections = [
  {
    label: 'Command',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Landscape', href: '/landscape', icon: Network },
      { name: 'Alertas', href: '/alerts', icon: AlertTriangle, alertBadge: true },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { name: 'Sistemas', href: '/systems', icon: Monitor },
      { name: 'Conectores', href: '/connectors', icon: Plug },
      { name: 'Eventos', href: '/events', icon: List },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { name: 'Análisis IA', href: '/ai', icon: Brain },
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      { name: 'Reportes', href: '/reports', icon: FileText },
      { name: 'Comparación', href: '/comparison', icon: GitCompare },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Runbooks', href: '/runbooks', icon: BookOpen },
      { name: 'Aprobaciones', href: '/approvals', icon: CheckCircle, badge: true },
      { name: 'Operaciones', href: '/operations', icon: Calendar },
      { name: 'Jobs (SM37)', href: '/jobs', icon: Play },
      { name: 'Transportes', href: '/transports', icon: Package },
      { name: 'SLA', href: '/sla', icon: Star },
      { name: 'HA Control', href: '/ha', icon: Activity },
      { name: 'Certificados', href: '/certificates', icon: Key },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { name: 'Gestión', href: '/admin', icon: Shield, roles: ['admin'] },
      { name: 'Usuarios', href: '/settings/users', icon: Users, roles: ['admin'] },
      { name: 'Configuración', href: '/settings', icon: Settings, roles: ['admin', 'escalation'] },
    ],
  },
];

const NAV_HEIGHT = 52;

export default function TopNav({ topOffset = 0 }) {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const [openPanel, setOpenPanel] = useState(null); // 'user' | 'notifications' | null

  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  const navRef = useRef(null);
  const lastScrollY = useRef(0);
  const closeTimeout = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, hasRole, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { currentPlan } = usePlan();
  const { organization } = useTenant();

  const toggleLanguage = useCallback(() => {
    const newLang = i18n.language === 'es' ? 'en' : 'es';
    i18n.changeLanguage(newLang);
    localStorage.setItem('spektra-language', newLang);
  }, [i18n]);

  // Reloj — actualiza cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Conteos del sistema + badges reales
  const [systemCounts, setSystemCounts] = useState({ healthy: 0, warning: 0, critical: 0 });
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; time: string; type: string }>>([]);
  useEffect(() => {
    dataService.getSystems().then(systems => {
      setSystemCounts({
        healthy: systems.filter(s => s.healthScore >= 90).length,
        warning: systems.filter(s => s.healthScore >= 70 && s.healthScore < 90).length,
        critical: systems.filter(s => s.healthScore < 70).length,
      });
    }).catch(err => log.warn('Systems fetch failed', { error: err.message }));
    dataService.getApprovals('PENDING').then(approvals => setPendingApprovals(approvals?.length || 0)).catch((err) => log.warn('Approvals fetch failed', { error: err.message }));
    dataService.getAlerts({ status: 'active' }).then(alerts => {
      setActiveAlerts(alerts?.length || 0);
      const recent = (alerts || []).slice(0, 5).map((a, i) => ({
        id: a.id || String(i),
        title: a.title || 'Alerta',
        message: `${a.systemSid || a.system?.sid || ''}: ${a.metric || a.title || ''}`,
        time: a.createdAt ? new Date(a.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '',
        type: a.level === 'critical' ? 'danger' : a.level === 'warning' ? 'warning' : 'info',
      }));
      setNotifications(recent);
    }).catch((err) => log.warn('Alerts fetch failed', { error: err.message }));
  }, []);
  const { healthy, warning, critical } = systemCounts;

  // Auto-hide al hacer scroll hacia abajo
  useEffect(() => {
    const handleScroll = () => {
      if (activeDropdown || mobileOpen) return;
      const currentY = window.scrollY;
      setNavVisible(currentY <= 80 || currentY < lastScrollY.current);
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeDropdown, mobileOpen]);

  // Cierra todos los menús — se usa en onClick de los NavLinks
  const closeAll = useCallback(() => {
    setActiveDropdown(null);
    setMobileOpen(false);
    setOpenPanel(null);
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setActiveDropdown(null);
        setMobileOpen(false);
        setOpenPanel(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Clic fuera
  useEffect(() => {
    const handleClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setActiveDropdown(null);
        setOpenPanel(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Hover handlers para dropdowns
  const openDropdown = useCallback((label) => {
    clearTimeout(closeTimeout.current);
    setActiveDropdown(label);
    setOpenPanel(null);
  }, []);

  const startClose = useCallback(() => {
    closeTimeout.current = setTimeout(() => setActiveDropdown(null), 150);
  }, []);

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimeout.current);
  }, []);

  // Detección de ruta activa
  const isItemActive = useCallback((href) => {
    return location.pathname === href || (href !== '/' && location.pathname.startsWith(href));
  }, [location.pathname]);

  const activeSectionLabel = useMemo(() => {
    for (const section of sections) {
      if (section.items.some(item => isItemActive(item.href))) {
        return section.label;
      }
    }
    return null;
  }, [isItemActive]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Main navigation"
        className="fixed left-0 right-0 z-50 transition-transform duration-300"
        style={{
          top: `${topOffset}px`,
          transform: navVisible ? 'translateY(0)' : `translateY(-${NAV_HEIGHT + topOffset}px)`,
          background: 'rgba(2,6,23,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(6,182,212,0.12)',
          boxShadow: '0 4px 30px rgba(0,0,0,0.4)',
        }}
      >
        {/* Línea decorativa superior con degradado */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.3), rgba(139,92,246,0.3), transparent)',
          }}
        />

        <div className="flex items-center px-4" style={{ height: `${NAV_HEIGHT}px` }}>

          {/* ── Logo ── */}
          <div className="flex items-center gap-2.5 mr-6 flex-shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #06b6d4, #7c3aed)',
                boxShadow: '0 0 14px rgba(6,182,212,0.35)',
              }}
            >
              <Zap size={16} className="text-white" />
            </div>
            <div className="hidden sm:block leading-none">
              <span
                className="text-sm font-bold"
                style={{
                  background: 'linear-gradient(90deg, #e2e8f0, #06b6d4)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                SAP Spektra
              </span>
              <p className="text-[9px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
                by Maveram
              </p>
            </div>
          </div>

          {/* ── Separador vertical ── */}
          <div className="hidden lg:block w-px h-6 mr-4" style={{ background: 'rgba(255,255,255,0.06)' }} />

          {/* ── Desktop: secciones con dropdown ── */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1">
            {sections.map(section => {
              if (section.adminOnly && !hasRole('admin')) return null;
              const isSectionActive = activeSectionLabel === section.label;
              const isOpen = activeDropdown === section.label;

              return (
                <div
                  key={section.label}
                  className="relative"
                  onMouseEnter={() => openDropdown(section.label)}
                  onMouseLeave={startClose}
                >
                  {/* Botón de la sección */}
                  <button
                    onClick={() => setActiveDropdown(prev => prev === section.label ? null : section.label)}
                    className="relative flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200"
                    style={{
                      color: isOpen ? '#ffffff' : isSectionActive ? '#06b6d4' : 'rgba(148,163,184,0.7)',
                      background: isOpen ? 'rgba(6,182,212,0.1)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isOpen) e.currentTarget.style.color = '#e2e8f0';
                    }}
                    onMouseLeave={(e) => {
                      if (!isOpen) {
                        e.currentTarget.style.color = isSectionActive ? '#06b6d4' : 'rgba(148,163,184,0.7)';
                      }
                    }}
                  >
                    {section.label}
                    <ChevronDown
                      size={11}
                      className="transition-transform duration-200"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none', opacity: 0.6 }}
                    />
                    {/* Indicador activo — línea cian */}
                    {isSectionActive && !isOpen && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '0px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '20px',
                          height: '2px',
                          borderRadius: '1px',
                          background: '#06b6d4',
                          boxShadow: '0 0 8px rgba(6,182,212,0.5)',
                        }}
                      />
                    )}
                  </button>

                  {/* Panel dropdown */}
                  {isOpen && (
                    <div
                      className="absolute top-full left-0 mt-2 min-w-[220px] rounded-xl overflow-hidden"
                      style={{
                        background: 'rgba(8,12,28,0.97)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: '1px solid rgba(6,182,212,0.15)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(6,182,212,0.04)',
                      }}
                      onMouseEnter={cancelClose}
                      onMouseLeave={startClose}
                    >
                      <div className="py-1.5">
                        {section.items.map(item => {
                          if (item.roles && !item.roles.some(r => hasRole(r))) return null;
                          const active = isItemActive(item.href);

                          return (
                            <NavLink
                              key={item.href}
                              to={item.href}
                              onClick={closeAll}
                              className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-all duration-150"
                              style={{
                                color: active ? '#06b6d4' : 'rgba(148,163,184,0.8)',
                                background: active ? 'rgba(6,182,212,0.08)' : 'transparent',
                                borderLeft: active ? '2px solid #06b6d4' : '2px solid transparent',
                              }}
                              onMouseEnter={(e) => {
                                if (!active) {
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                  e.currentTarget.style.color = '#e2e8f0';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!active) {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'rgba(148,163,184,0.8)';
                                }
                              }}
                            >
                              <item.icon size={15} style={{ color: active ? '#06b6d4' : undefined, opacity: active ? 1 : 0.7 }} />
                              <span className="flex-1">{item.name}</span>

                              {item.badge && pendingApprovals > 0 && (
                                <span
                                  className="px-1.5 py-0.5 text-[9px] font-bold rounded-full"
                                  style={{
                                    background: 'rgba(239,68,68,0.2)',
                                    color: '#f87171',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    boxShadow: '0 0 6px rgba(239,68,68,0.2)',
                                  }}
                                >
                                  {pendingApprovals}
                                </span>
                              )}
                              {item.alertBadge && activeAlerts > 0 && (
                                <span
                                  className="px-1.5 py-0.5 text-[9px] font-bold rounded-full"
                                  style={{
                                    background: 'rgba(6,182,212,0.15)',
                                    color: '#06b6d4',
                                    border: '1px solid rgba(6,182,212,0.3)',
                                    boxShadow: '0 0 6px rgba(6,182,212,0.25)',
                                  }}
                                >
                                  {activeAlerts}
                                </span>
                              )}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            className="lg:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'rgba(148,163,184,0.8)' }}
            onClick={() => { setMobileOpen(!mobileOpen); setOpenPanel(null); }}
            aria-label={mobileOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Spacer mobile */}
          <div className="flex-1 lg:hidden" />

          {/* ── Controles derecha ── */}
          <div className="flex items-center gap-2 ml-auto lg:ml-0">

            {/* Indicadores de estado */}
            <div className="hidden md:flex items-center gap-2.5 text-[11px] font-mono px-3 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.6)' }} />
                <span style={{ color: 'rgba(34,197,94,0.9)' }}>{healthy}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#eab308', boxShadow: '0 0 4px rgba(234,179,8,0.6)' }} />
                <span style={{ color: 'rgba(234,179,8,0.9)' }}>{warning}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444', boxShadow: '0 0 4px rgba(239,68,68,0.6)' }} />
                <span style={{ color: 'rgba(239,68,68,0.9)' }}>{critical}</span>
              </div>
            </div>

            {/* Reloj */}
            <span
              className="hidden sm:block text-[11px] font-mono px-2"
              style={{ color: 'rgba(148,163,184,0.45)' }}
            >
              {time}
            </span>

            {/* Separador */}
            <div className="hidden sm:block w-px h-5" style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* Toggle de tema */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg transition-all duration-200"
              style={{ color: 'rgba(148,163,184,0.55)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#06b6d4'; e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.55)'; e.currentTarget.style.background = 'transparent'; }}
              aria-label={theme === 'dark' ? t('topnav.lightMode') : t('topnav.darkMode')}
              title={theme === 'dark' ? t('topnav.lightMode') : t('topnav.darkMode')}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="px-1.5 py-1 rounded-lg transition-all duration-200 text-[11px] font-semibold"
              style={{ color: 'rgba(148,163,184,0.55)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#06b6d4'; e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.55)'; e.currentTarget.style.background = 'transparent'; }}
              aria-label={t('topnav.language')}
              title={i18n.language === 'es' ? t('topnav.switchToEnglish') : t('topnav.switchToSpanish')}
            >
              {i18n.language === 'es' ? 'EN' : 'ES'}
            </button>

            {/* Notificaciones */}
            <div className="relative">
              <button
                onClick={() => setOpenPanel(prev => prev === 'notifications' ? null : 'notifications')}
                className="p-1.5 rounded-lg transition-all duration-200 relative"
                style={{ color: 'rgba(148,163,184,0.55)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#06b6d4'; e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(148,163,184,0.55)'; e.currentTarget.style.background = 'transparent'; }}
                aria-label="Notificaciones"
                aria-expanded={openPanel === 'notifications'}
              >
                <Bell size={15} />
                <span
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full animate-pulse"
                  style={{ background: '#06b6d4', boxShadow: '0 0 6px rgba(6,182,212,0.7)' }}
                />
              </button>

              {/* Dropdown notificaciones */}
              {openPanel === 'notifications' && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(8,12,28,0.97)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(6,182,212,0.15)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                  }}
                >
                  <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(6,182,212,0.7)' }}>
                      Notificaciones
                    </h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className="px-4 py-3 cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                            style={{
                              background: n.type === 'danger' ? '#ef4444' : n.type === 'warning' ? '#eab308' : '#22c55e',
                              boxShadow: n.type === 'danger'
                                ? '0 0 4px rgba(239,68,68,0.6)'
                                : n.type === 'warning'
                                  ? '0 0 4px rgba(234,179,8,0.6)'
                                  : '0 0 4px rgba(34,197,94,0.6)',
                            }}
                          />
                          <div>
                            <p className="text-xs font-medium" style={{ color: '#e2e8f0' }}>{n.title}</p>
                            <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)' }}>{n.message}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>{n.time}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      onClick={() => { navigate('/alerts'); setOpenPanel(null); }}
                      className="text-[11px] font-semibold transition-colors"
                      style={{ color: '#06b6d4' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#22d3ee'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#06b6d4'; }}
                    >
                      Ver todas →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Usuario */}
            <div className="relative">
              <button
                onClick={() => setOpenPanel(prev => prev === 'user' ? null : 'user')}
                aria-label="Menú de usuario"
                aria-expanded={openPanel === 'user'}
                className="flex items-center gap-2 py-1 px-1.5 rounded-lg transition-all duration-200"
                style={{
                  background: openPanel === 'user' ? 'rgba(6,182,212,0.1)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (openPanel !== 'user') e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (openPanel !== 'user') e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4, #7c3aed)',
                    color: 'white',
                    boxShadow: '0 0 8px rgba(6,182,212,0.3)',
                  }}
                >
                  {(user?.name || user?.username || 'U')[0].toUpperCase()}
                </div>
                <ChevronDown
                  size={11}
                  className="hidden sm:block transition-transform duration-200"
                  style={{
                    color: 'rgba(148,163,184,0.4)',
                    transform: openPanel === 'user' ? 'rotate(180deg)' : 'none',
                  }}
                />
              </button>

              {/* Dropdown usuario */}
              {openPanel === 'user' && (
                <div
                  className="absolute right-0 top-full mt-2 w-[220px] rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(8,12,28,0.97)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(6,182,212,0.15)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                  }}
                >
                  {/* Info del usuario */}
                  <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
                      {user?.name || user?.username}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                      {user?.role} · {currentPlan?.name}
                    </p>
                    <p className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>
                      {organization?.name}
                    </p>
                  </div>

                  {/* Opciones */}
                  <div className="py-1">
                    <button
                      onClick={() => { navigate('/settings'); setOpenPanel(null); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] transition-colors"
                      style={{ color: 'rgba(148,163,184,0.8)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#e2e8f0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.8)'; }}
                    >
                      <Settings size={14} />
                      Configuración
                    </button>
                    <button
                      onClick={() => { navigate('/profile'); setOpenPanel(null); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] transition-colors"
                      style={{ color: 'rgba(148,163,184,0.8)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#e2e8f0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(148,163,184,0.8)'; }}
                    >
                      <User size={14} />
                      Mi Perfil
                    </button>
                  </div>

                  {/* Logout */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="py-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] transition-colors"
                      style={{ color: 'rgba(239,68,68,0.8)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <LogOut size={14} />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Panel móvil ── */}
        {mobileOpen && (
          <div
            className="lg:hidden"
            style={{
              background: 'rgba(8,12,28,0.98)',
              borderTop: '1px solid rgba(6,182,212,0.1)',
              maxHeight: 'calc(100vh - 52px)',
              overflowY: 'auto',
            }}
          >
            <div className="p-4 grid grid-cols-2 gap-6">
              {sections.map(section => {
                if (section.adminOnly && !hasRole('admin')) return null;
                return (
                  <div key={section.label}>
                    <p
                      className="text-[9px] font-bold uppercase tracking-[0.18em] mb-2"
                      style={{ color: 'rgba(6,182,212,0.55)' }}
                    >
                      {section.label}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map(item => {
                        if (item.roles && !item.roles.some(r => hasRole(r))) return null;
                        const active = isItemActive(item.href);
                        return (
                          <NavLink
                            key={item.href}
                            to={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-colors"
                            style={{
                              color: active ? '#06b6d4' : 'rgba(148,163,184,0.7)',
                              background: active ? 'rgba(6,182,212,0.08)' : 'transparent',
                            }}
                          >
                            <item.icon size={14} />
                            {item.name}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Status indicators en móvil */}
            <div
              className="flex md:hidden items-center justify-center gap-4 py-3 mx-4 mb-3 rounded-lg text-[11px] font-mono"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                <span style={{ color: 'rgba(34,197,94,0.9)' }}>{healthy} OK</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#eab308' }} />
                <span style={{ color: 'rgba(234,179,8,0.9)' }}>{warning} WARN</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />
                <span style={{ color: 'rgba(239,68,68,0.9)' }}>{critical} CRIT</span>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Backdrop oscuro cuando hay dropdown abierto */}
      {(activeDropdown || openPanel) && (
        <div
          className="fixed inset-0 z-40"
          style={{ top: `${NAV_HEIGHT}px` }}
          onClick={() => { setActiveDropdown(null); setOpenPanel(null); }}
        />
      )}
    </>
  );
}

export { NAV_HEIGHT };

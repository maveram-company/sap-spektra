import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Monitor, CheckCircle, Calendar, BarChart3,
  GitCompare, Shield, Settings, Users,
  ChevronLeft, ChevronRight, Zap, AlertTriangle, List,
  Brain, FileText, BookOpen, Network, Star,
  Activity, Play, Package, Key
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePlan } from '../../hooks/usePlan';
import { useTenant } from '../../contexts/TenantContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { dataService } from '../../services/dataService';

const navigation = [
  { section: 'Command Center' },
  { nameKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
  { nameKey: 'nav.landscape', href: '/landscape', icon: Network },
  { nameKey: 'nav.alerts', href: '/alerts', icon: AlertTriangle, alertBadge: true },

  { section: 'Monitor' },
  { nameKey: 'nav.systems', href: '/systems', icon: Monitor },
  { nameKey: 'nav.events', href: '/events', icon: List },

  { section: 'Intelligence' },
  { nameKey: 'nav.ai', href: '/ai', icon: Brain },
  { nameKey: 'nav.analytics', href: '/analytics', icon: BarChart3 },
  { nameKey: 'nav.reports', href: '/reports', icon: FileText },
  { nameKey: 'nav.comparison', href: '/comparison', icon: GitCompare },

  { section: 'Operations' },
  { nameKey: 'nav.runbooks', href: '/runbooks', icon: BookOpen },
  { nameKey: 'nav.approvals', href: '/approvals', icon: CheckCircle, badge: true },
  { nameKey: 'nav.operations', href: '/operations', icon: Calendar },
  { nameKey: 'nav.jobs', href: '/jobs', icon: Play },
  { nameKey: 'nav.transports', href: '/transports', icon: Package },
  { nameKey: 'nav.sla', href: '/sla', icon: Star },

  { section: 'Infrastructure' },
  { nameKey: 'nav.haControl', href: '/ha', icon: Activity },
  { nameKey: 'nav.certificates', href: '/certificates', icon: Key },

  { section: 'Admin', adminOnly: true },
  { nameKey: 'nav.admin', href: '/admin', icon: Shield, roles: ['admin'] },
  { nameKey: 'nav.users', href: '/settings/users', icon: Users, roles: ['admin'] },
  { nameKey: 'nav.settings', href: '/settings', icon: Settings, roles: ['admin', 'escalation'] },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { collapsed, toggle } = useSidebar();
  const { hasRole } = useAuth();
  const { currentPlan } = usePlan();
  const { organization } = useTenant();
  const location = useLocation();

  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  useEffect(() => {
    dataService.getApprovals('PENDING').then(a => setPendingApprovals(a?.length || 0)).catch(() => { /* badge fetch failed — counts may be stale */ });
    dataService.getAlerts({ status: 'active' }).then(a => setActiveAlerts(a?.length || 0)).catch(() => { /* badge fetch failed — counts may be stale */ });
  }, []);

  const usagePercent = Math.round(
    ((organization?.usage?.systems || 0) / (organization?.limits?.maxSystems || 25)) * 100
  );

  return (
    <aside
      className={`fixed left-0 top-0 h-screen flex flex-col transition-all duration-300 z-40 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, #020617 0%, #060d1f 100%)',
        borderRight: '1px solid rgba(6, 182, 212, 0.12)',
        boxShadow: '4px 0 32px rgba(0,0,0,0.5), inset -1px 0 0 rgba(6,182,212,0.06)',
      }}
    >
      {/* Subtle grid pattern overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Everything else sits above the grid */}
      <div className="relative z-10 flex flex-col h-full">

        {/* ── Logo area ─────────────────────────────────────────── */}
        <div
          className="flex items-center px-4 flex-shrink-0"
          style={{
            height: '64px',
            borderBottom: '1px solid rgba(6,182,212,0.12)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Gradient icon */}
            <div
              className="flex items-center justify-center flex-shrink-0 rounded-xl"
              style={{
                width: '36px',
                height: '36px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #7c3aed 100%)',
                boxShadow: '0 0 16px rgba(6,182,212,0.35)',
              }}
            >
              <Zap size={18} className="text-white" />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <h1
                  className="text-sm font-bold truncate"
                  style={{
                    background: 'linear-gradient(90deg, #e2e8f0 0%, #06b6d4 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  SAP Spektra
                </h1>
                <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.6)' }}>
                  by Maveram
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Navigation ────────────────────────────────────────── */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-3 px-2" style={{ scrollbarWidth: 'none' }}>
          <ul className="list-none m-0 p-0">
          {navigation.map((item, i) => {
            /* ── Section header ── */
            if (item.section) {
              if (item.adminOnly && !hasRole('admin')) return null;

              if (collapsed) {
                return (
                  <li key={i} role="presentation">
                  <div
                    className="mx-auto mt-4 mb-2"
                    style={{
                      width: '28px',
                      height: '1px',
                      background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.25), transparent)',
                    }}
                  />
                  </li>
                );
              }

              return (
                <li key={i} role="presentation" className="mt-5 mb-1 first:mt-2">
                  <span
                    className="px-2 text-[9px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(6,182,212,0.55)' }}
                  >
                    {item.section}
                  </span>
                </li>
              );
            }

            /* ── Role guard ── */
            if (item.roles && !item.roles.some(r => hasRole(r))) return null;

            const isActive =
              location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));

            return (
              <li key={item.href}>
              <NavLink
                to={item.href}
                title={collapsed ? t(item.nameKey) : undefined}
                className="flex items-center gap-3 mb-0.5 text-sm font-medium transition-all duration-200 group relative"
                style={({ isActive: routerActive }) => {
                  const active = routerActive || isActive;
                  return {
                    borderRadius: '10px',
                    padding: collapsed ? '10px 0' : '9px 10px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    color: active ? '#ffffff' : 'rgba(148,163,184,0.7)',
                    background: active
                      ? 'rgba(6,182,212,0.08)'
                      : 'transparent',
                    borderLeft: active && !collapsed
                      ? '3px solid #06b6d4'
                      : '3px solid transparent',
                    paddingLeft: active && !collapsed ? '7px' : collapsed ? undefined : '10px',
                    boxShadow: active
                      ? 'inset 0 0 20px rgba(6,182,212,0.05)'
                      : 'none',
                  };
                }}
              >
                {/* Icon */}
                <item.icon
                  size={17}
                  className="flex-shrink-0 transition-colors duration-200"
                  style={{ color: isActive ? '#06b6d4' : undefined }}
                />

                {/* Label + badges (expanded only) */}
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">{t(item.nameKey)}</span>

                    {/* Approval badge — danger glow */}
                    {item.badge && pendingApprovals > 0 && (
                      <span
                        className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full flex-shrink-0"
                        style={{
                          background: 'rgba(239,68,68,0.2)',
                          color: '#f87171',
                          border: '1px solid rgba(239,68,68,0.3)',
                          boxShadow: '0 0 8px rgba(239,68,68,0.25)',
                        }}
                      >
                        {pendingApprovals}
                      </span>
                    )}

                    {/* Alert badge — cyan glow */}
                    {item.alertBadge && activeAlerts > 0 && (
                      <span
                        className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full flex-shrink-0"
                        style={{
                          background: 'rgba(6,182,212,0.15)',
                          color: '#06b6d4',
                          border: '1px solid rgba(6,182,212,0.3)',
                          boxShadow: '0 0 8px rgba(6,182,212,0.3)',
                        }}
                      >
                        {activeAlerts}
                      </span>
                    )}
                  </>
                )}

                {/* Collapsed active indicator — small cyan dot */}
                {collapsed && isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: '#06b6d4',
                      boxShadow: '0 0 6px #06b6d4',
                    }}
                  />
                )}

                {/* Collapsed badge dots */}
                {collapsed && item.badge && pendingApprovals > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '7px',
                      right: '10px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      boxShadow: '0 0 6px rgba(239,68,68,0.7)',
                    }}
                  />
                )}
                {collapsed && item.alertBadge && activeAlerts > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '7px',
                      right: '10px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#06b6d4',
                      boxShadow: '0 0 6px rgba(6,182,212,0.7)',
                    }}
                  />
                )}
              </NavLink>
              </li>
            );
          })}
          </ul>
        </nav>

        {/* ── Plan badge (expanded only) ─────────────────────────── */}
        {!collapsed && (
          <div
            className="mx-2 mb-2 p-3 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(6,182,212,0.14)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-white">{currentPlan?.name}</span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold"
                style={{
                  background: 'rgba(6,182,212,0.12)',
                  color: '#06b6d4',
                  border: '1px solid rgba(6,182,212,0.2)',
                }}
              >
                {t('sidebar.currentPlan')}
              </span>
            </div>
            <p className="text-[10px] mb-2" style={{ color: 'rgba(148,163,184,0.6)' }}>
              {t('sidebar.systemsUsage', { used: organization?.usage?.systems || 0, total: organization?.limits?.maxSystems || 25 })}
            </p>
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${usagePercent}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #7c3aed)',
                  boxShadow: '0 0 8px rgba(6,182,212,0.4)',
                }}
              />
            </div>
          </div>
        )}

        {/* ── Collapse toggle ────────────────────────────────────── */}
        <div
          className="px-2 pb-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(6,182,212,0.1)' }}
        >
          <button
            onClick={toggle}
            className="w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 mt-2"
            style={{
              color: 'rgba(148,163,184,0.5)',
              background: 'transparent',
              border: '1px solid rgba(6,182,212,0.08)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(6,182,212,0.08)';
              e.currentTarget.style.color = '#06b6d4';
              e.currentTarget.style.borderColor = 'rgba(6,182,212,0.25)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(148,163,184,0.5)';
              e.currentTarget.style.borderColor = 'rgba(6,182,212,0.08)';
            }}
            aria-label={collapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <ChevronRight size={15} />
              : (
                <span className="flex items-center gap-2 text-xs font-medium">
                  <ChevronLeft size={15} />
                  {t('sidebar.collapse')}
                </span>
              )
            }
          </button>
        </div>

      </div>
    </aside>
  );
}

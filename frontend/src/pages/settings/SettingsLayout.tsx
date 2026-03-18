import { NavLink, Outlet } from 'react-router-dom';
import { Building2, Users, Shield, Link2, CreditCard, ScrollText, Bell } from 'lucide-react';
import Header from '../../components/layout/Header';

const settingsNav = [
  { name: 'General', href: '/settings', icon: Building2, end: true },
  { name: 'Usuarios', href: '/settings/users', icon: Users },
  { name: 'Roles y Permisos', href: '/settings/roles', icon: Shield },
  { name: 'Integraciones', href: '/settings/integrations', icon: Link2 },
  { name: 'Notificaciones', href: '/settings/notifications', icon: Bell },
  { name: 'Plan y Facturación', href: '/settings/billing', icon: CreditCard },
  { name: 'Auditoría', href: '/settings/audit', icon: ScrollText },
];

export default function SettingsLayout() {
  return (
    <div>
      <Header title="Configuración" subtitle="Administra tu organización y preferencias" />
      <div className="flex">
        <nav className="w-56 min-h-[calc(100vh-4rem)] border-r border-border bg-surface p-4 flex-shrink-0">
          <div className="space-y-0.5">
            {settingsNav.map((item: any) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.end}
                className={({ isActive }: any) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                }`}
              >
                <item.icon size={16} />
                {item.name}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

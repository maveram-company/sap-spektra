import { Shield, Info } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';

const roles = [
  {
    id: 'admin',
    name: 'Administrador',
    level: 40,
    description: 'Acceso total al sistema. Puede gestionar usuarios, configuración, planes y todas las operaciones.',
    permissions: ['Ver dashboard', 'Gestionar sistemas', 'Ejecutar runbooks', 'Aprobar operaciones', 'Gestionar usuarios', 'Configurar organización', 'Ver auditoría', 'Gestionar integraciones', 'Gestionar planes'],
    variant: 'danger',
  },
  {
    id: 'escalation',
    name: 'Escalación (L2/L3)',
    level: 30,
    description: 'Operador avanzado con capacidad de aprobar operaciones críticas y modificar reglas de alertas.',
    permissions: ['Ver dashboard', 'Gestionar sistemas', 'Ejecutar runbooks', 'Aprobar operaciones', 'Modificar reglas de alertas', 'Ver auditoría'],
    variant: 'warning',
  },
  {
    id: 'operator',
    name: 'Operador (L1)',
    level: 20,
    description: 'Monitorea sistemas, ejecuta runbooks pre-aprobados y gestiona incidentes del día a día.',
    permissions: ['Ver dashboard', 'Ver sistemas', 'Ejecutar runbooks pre-aprobados', 'Gestionar incidentes', 'Usar chatbot'],
    variant: 'primary',
  },
  {
    id: 'viewer',
    name: 'Viewer',
    level: 10,
    description: 'Acceso de solo lectura. Puede ver dashboards, métricas y reportes sin realizar acciones.',
    permissions: ['Ver dashboard', 'Ver sistemas', 'Ver métricas', 'Ver reportes'],
    variant: 'default',
  },
];

export default function RolesPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Roles y Permisos</h2>
        <p className="text-sm text-text-secondary mt-1">Define los niveles de acceso para tu equipo</p>
      </div>

      <div className="space-y-4">
        {roles.map(role => (
          <Card key={role.id}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center flex-shrink-0">
                <Shield size={20} className="text-text-secondary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-text-primary">{role.name}</h3>
                  <Badge variant={role.variant} size="sm">Nivel {role.level}</Badge>
                </div>
                <p className="text-xs text-text-secondary mb-3">{role.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((perm, i) => (
                    <span key={i} className="px-2 py-0.5 text-[10px] bg-surface-tertiary rounded-full text-text-secondary">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-primary-700 dark:text-primary-300">Modelo Jerárquico</p>
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
              Los roles son jerárquicos: cada nivel superior hereda todos los permisos del nivel inferior.
              Un Administrador puede hacer todo lo que hace un Escalation, Operador y Viewer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

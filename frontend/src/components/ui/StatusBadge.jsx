import Badge from './Badge';

const statusConfig = {
  healthy: { label: 'Saludable', variant: 'success', dot: true },
  warning: { label: 'Atenci\u00f3n', variant: 'warning', dot: true },
  degraded: { label: 'Degradado', variant: 'warning', dot: true },
  critical: { label: 'Cr\u00edtico', variant: 'danger', dot: true },
  offline: { label: 'Offline', variant: 'default', dot: true },
  pending: { label: 'Pendiente', variant: 'warning', dot: true },
  approved: { label: 'Aprobado', variant: 'success', dot: true },
  rejected: { label: 'Rechazado', variant: 'danger', dot: true },
  expired: { label: 'Expirado', variant: 'default', dot: true },
  executing: { label: 'Ejecutando', variant: 'primary', dot: true },
  completed: { label: 'Completado', variant: 'success', dot: true },
  failed: { label: 'Fallido', variant: 'danger', dot: true },
  scheduled: { label: 'Programado', variant: 'info', dot: true },
  trial: { label: 'Trial', variant: 'warning' },
  production: { label: 'Producci\u00f3n', variant: 'success' },
};

export default function StatusBadge({ status, size = 'md', className = '' }) {
  const config = statusConfig[status?.toLowerCase()] || { label: status, variant: 'default' };
  return <Badge variant={config.variant} size={size} dot={config.dot} className={className}>{config.label}</Badge>;
}

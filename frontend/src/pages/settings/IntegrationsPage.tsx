import { useState } from 'react';
import { Link2, ExternalLink, Check, X, AlertTriangle } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { usePlan } from '../../hooks/usePlan';
import type { ApiRecord } from '../../types';

const integrations = [
  { id: 'slack', name: 'Slack', description: 'Notificaciones en canales de Slack', icon: '💬', connected: true, plan: 'integrations_basic' },
  { id: 'teams', name: 'Microsoft Teams', description: 'Alertas y aprobaciones en Teams', icon: '👥', connected: false, plan: 'integrations_basic' },
  { id: 'email', name: 'Email (SES)', description: 'Notificaciones por correo electrónico', icon: '📧', connected: true, plan: 'alerts_basic' },
  { id: 'servicenow', name: 'ServiceNow', description: 'Sincronización de tickets ITSM', icon: '🎫', connected: false, plan: 'integrations_advanced' },
  { id: 'jira', name: 'Jira', description: 'Creación automática de tickets', icon: '📋', connected: false, plan: 'integrations_advanced' },
  { id: 'pagerduty', name: 'PagerDuty', description: 'Escalación de alertas críticas', icon: '🚨', connected: false, plan: 'integrations_advanced' },
];

export default function IntegrationsPage() {
  const { hasFeature } = usePlan();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async (id: string) => {
    setConnecting(id);
    setConnectError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 1000));
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? (err as Error).message : 'Error al conectar integración');
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Integraciones</h2>
        <p className="text-sm text-text-secondary mt-1">Conecta SAP Spektra con tus herramientas</p>
      </div>

      {connectError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {connectError}
          <button onClick={() => setConnectError(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      <div className="space-y-4">
        {integrations.map((integration: ApiRecord) => {
          const available = hasFeature(integration.plan);
          return (
            <Card key={integration.id} className={!available ? 'opacity-60' : ''}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-surface-tertiary flex items-center justify-center text-2xl">
                    {integration.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{integration.name}</h3>
                      {integration.connected && <Badge variant="success" size="sm" dot>Conectado (demo)</Badge>}
                      {!available && <Badge variant="warning" size="sm">Premium</Badge>}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{integration.description}</p>
                  </div>
                </div>
                <div>
                  {integration.connected ? (
                    <Button variant="outline" size="sm">Configurar</Button>
                  ) : available ? (
                    <Button size="sm" loading={connecting === integration.id} onClick={() => handleConnect(integration.id)}>
                      Conectar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Upgrade requerido</Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

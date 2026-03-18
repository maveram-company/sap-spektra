import { Check, Star, ArrowRight } from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

export default function BillingPage() {
  const { currentPlan, getAllPlans } = usePlan();
  const allPlans = getAllPlans();

  const featureLabels = {
    monitoring: 'Monitoreo de sistemas',
    dashboard: 'Dashboard en tiempo real',
    alerts_basic: 'Alertas básicas',
    alerts_advanced: 'Alertas avanzadas con IA',
    runbooks: 'Runbooks automatizados (25+)',
    ai_analysis: 'Análisis con IA (7 casos de uso)',
    approvals: 'Flujos de aprobación',
    scheduling: 'Operaciones programadas',
    integrations_basic: 'Integraciones (Slack, Email)',
    integrations_advanced: 'Integraciones avanzadas (ServiceNow, Jira)',
    analytics: 'Analytics de runbooks',
    comparison: 'Comparación de sistemas',
    chat: 'Chatbot IA',
    ha_orchestration: 'Orquestación HA (Failover)',
    compliance: 'Compliance (SOX, ISO 27001)',
    audit: 'Log de auditoría',
    custom_runbooks: 'Runbooks personalizados',
    sso: 'SSO / SAML',
    api_access: 'Acceso API',
    dedicated_support: 'Soporte dedicado',
    multi_cloud: 'Multi-Cloud (Azure, GCP)',
    sap_rise: 'Integración SAP RISE',
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Plan y Facturación</h2>
        <p className="text-sm text-text-secondary mt-1">Gestiona tu suscripción y revisa tu consumo</p>
      </div>

      {/* Current Plan */}
      <Card className="mb-8 border-primary-200 dark:border-primary-800 bg-gradient-to-r from-primary-50 to-surface dark:from-primary-900/20 dark:to-surface">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-text-primary">Plan {currentPlan.name}</h3>
              <Badge variant="primary">Activo</Badge>
            </div>
            <p className="text-sm text-text-secondary mt-1">{currentPlan.description}</p>
            <p className="text-2xl font-bold text-text-primary mt-3">
              {currentPlan.price !== null ? `$${currentPlan.price}` : 'Contactar'}<span className="text-sm font-normal text-text-secondary">/mes</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-tertiary">Próximo cobro</p>
            <p className="text-sm font-medium text-text-primary">1 de Abril, 2026</p>
          </div>
        </div>
      </Card>

      {/* Plan Cards */}
      <h3 className="text-lg font-semibold text-text-primary mb-4">Planes Disponibles</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {allPlans.map((plan: any) => (
          <Card
            key={plan.id}
            className={`relative ${plan.popular ? 'border-primary-500 dark:border-primary-500 ring-1 ring-primary-500' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="primary"><Star size={10} className="mr-0.5" /> Más Popular</Badge>
              </div>
            )}

            <div className="text-center mb-6">
              <h4 className="text-lg font-bold text-text-primary">{plan.name}</h4>
              <p className="text-xs text-text-secondary mt-1">{plan.description}</p>
              <div className="mt-4">
                {plan.price !== null ? (
                  <span className="text-3xl font-bold text-text-primary">${plan.price}<span className="text-sm font-normal text-text-secondary">/mes</span></span>
                ) : (
                  <span className="text-xl font-bold text-text-primary">Personalizado</span>
                )}
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Incluye:</p>
              <div className="text-xs text-text-secondary">
                <p>{plan.limits.maxSystems === Infinity ? 'Ilimitados' : plan.limits.maxSystems} sistemas</p>
                <p>{plan.limits.maxUsers === Infinity ? 'Ilimitados' : plan.limits.maxUsers} usuarios</p>
                <p>{plan.limits.aiCallsPerDay} llamadas IA/día</p>
                <p>{plan.limits.retentionDays} días de retención</p>
              </div>
            </div>

            {currentPlan.id === plan.id ? (
              <Button variant="secondary" fullWidth disabled>Plan Actual</Button>
            ) : (
              <Button variant={plan.popular ? 'primary' : 'outline'} fullWidth icon={plan.price === null ? undefined : ArrowRight}>
                {plan.price === null ? 'Contactar Ventas' : 'Upgrade'}
              </Button>
            )}
          </Card>
        ))}
      </div>

      {/* Feature Comparison */}
      <Card>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Comparación de Funcionalidades</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-semibold text-text-secondary uppercase">Funcionalidad</th>
                {allPlans.map((p: any) => (
                  <th key={p.id} className="text-center py-3 px-4 text-xs font-semibold text-text-secondary uppercase">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(featureLabels).map(([key, label]: [string, any]) => (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-4 text-text-primary">{label}</td>
                  {allPlans.map((p: any) => (
                    <td key={p.id} className="text-center py-2.5 px-4">
                      {p.features.includes(key) ? (
                        <Check size={16} className="inline text-success-600" />
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

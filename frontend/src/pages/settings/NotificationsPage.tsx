import { useState } from 'react';
import { Mail, Save, AlertTriangle } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';

function Toggle({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && <p className="text-xs text-text-secondary mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-primary-600' : 'bg-border-strong'}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const [settings, setSettings] = useState({
    emailBreaches: true,
    emailApprovals: true,
    emailReports: true,
    slackBreaches: false,
    slackApprovals: false,
    digestDaily: true,
    digestWeekly: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar preferencias');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary">Notificaciones</h2>
        <p className="text-sm text-text-secondary mt-1">Configura cómo y cuándo recibir alertas</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Email</CardTitle>
              <CardDescription>Notificaciones por correo electrónico</CardDescription>
            </div>
            <Mail size={18} className="text-text-tertiary" />
          </CardHeader>
          <div className="divide-y divide-border">
            <Toggle label="Breaches y alertas críticas" description="Notificación inmediata al detectar un breach" enabled={settings.emailBreaches} onChange={(v) => update('emailBreaches', v)} />
            <Toggle label="Solicitudes de aprobación" description="Cuando un runbook requiere aprobación" enabled={settings.emailApprovals} onChange={(v) => update('emailApprovals', v)} />
            <Toggle label="Reportes de compliance" description="Reporte semanal de SOX/ISO" enabled={settings.emailReports} onChange={(v) => update('emailReports', v)} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Resúmenes</CardTitle>
              <CardDescription>Digestos periódicos con el estado general</CardDescription>
            </div>
          </CardHeader>
          <div className="divide-y divide-border">
            <Toggle label="Digesto diario" description="Resumen de las últimas 24 horas a las 22:00" enabled={settings.digestDaily} onChange={(v) => update('digestDaily', v)} />
            <Toggle label="Reporte semanal" description="Reporte completo cada lunes a las 08:00" enabled={settings.digestWeekly} onChange={(v) => update('digestWeekly', v)} />
          </div>
        </Card>

        {saveError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
            <AlertTriangle size={14} className="flex-shrink-0" />
            {saveError}
          </div>
        )}
        <div className="flex justify-end">
          <Button icon={Save} loading={saving} onClick={handleSave}>Guardar Preferencias</Button>
        </div>
      </div>
    </div>
  );
}

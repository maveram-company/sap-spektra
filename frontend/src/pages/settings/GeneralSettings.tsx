import { useState, useEffect } from 'react';
import { Building2, Globe, Save, AlertTriangle, Shield, Calendar, Key, Copy } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { dataService } from '../../services/dataService';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';

export default function GeneralSettings() {
  const { organization, updateSettings } = useTenant();
  const [thresholds, setThresholds] = useState([]);
  const [escalationPolicy, setEscalationPolicy] = useState<any[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    Promise.all([
      dataService.getThresholds(),
      dataService.getEscalationPolicy(),
      dataService.getMaintenanceWindows(),
      dataService.getApiKeys(),
    ]).then(([t, e, m, a]: any[]) => {
      setThresholds(t);
      setEscalationPolicy(e);
      setMaintenanceWindows(m);
      setApiKeys(a);
    });
  }, []);
  const [form, setForm] = useState({
    name: organization.name,
    slug: organization.slug,
    timezone: organization.settings.timezone,
    language: organization.settings.language,
  });

  const handleSave = async () => {
    if (!form.name.trim()) {
      setNameError('El nombre de la organización es requerido');
      return;
    }
    setNameError('');
    setSaving(true);
    setSaveError(null);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise(r => setTimeout(r, 800));
      updateSettings({ timezone: form.timezone, language: form.language });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">General</h2>
        <p className="text-sm text-text-secondary mt-1">Configuración básica de tu organización</p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Información de la Organización</CardTitle>
            <CardDescription>Datos principales de tu cuenta</CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-4">
          <Input
            label="Nombre de la Organización"
            value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); if (nameError) setNameError(''); }}
            icon={Building2}
            required
            error={nameError || undefined}
          />
          <Input
            label="Slug (URL)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            icon={Globe}
            hint="Se usa en URLs: app.spektra.maveram.com/org-slug"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Zona Horaria"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              options={[
                { value: 'America/Bogota', label: 'America/Bogotá (UTC-5)' },
                { value: 'America/Sao_Paulo', label: 'America/São Paulo (UTC-3)' },
                { value: 'America/Mexico_City', label: 'America/México City (UTC-6)' },
                { value: 'Europe/Madrid', label: 'Europe/Madrid (UTC+1)' },
                { value: 'US/Eastern', label: 'US/Eastern (UTC-5)' },
              ]}
            />
            <Select
              label="Idioma"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              options={[
                { value: 'es', label: 'Español' },
                { value: 'en', label: 'English' },
                { value: 'pt', label: 'Português' },
              ]}
            />
          </div>
        </div>

        {saveError && (
          <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">
            <AlertTriangle size={14} className="flex-shrink-0" />
            {saveError}
          </div>
        )}
        <div className="flex justify-end mt-6 pt-4 border-t border-border">
          <Button icon={Save} loading={saving} onClick={handleSave}>Guardar Cambios</Button>
        </div>
      </Card>

      {/* Usage Overview */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Uso Actual</CardTitle>
            <CardDescription>Consumo de recursos de tu plan</CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-4">
          {[
            { label: 'Sistemas', used: organization.usage.systems, max: organization.limits.maxSystems },
            { label: 'Usuarios', used: organization.usage.users, max: organization.limits.maxUsers },
            { label: 'Integraciones', used: organization.usage.integrations, max: organization.limits.maxIntegrations },
            { label: 'Llamadas IA (hoy)', used: organization.usage.aiCallsToday, max: organization.limits.aiCallsPerDay },
          ].map(item => {
            const pct = Math.round((item.used / item.max) * 100);
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-text-primary">{item.label}</span>
                  <span className="text-xs text-text-secondary">{item.used} / {item.max === Infinity ? '∞' : item.max}</span>
                </div>
                <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pct > 80 ? 'bg-danger-500' : pct > 60 ? 'bg-warning-500' : 'bg-primary-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="border-danger-200 dark:border-danger-800">
        <CardHeader>
          <div>
            <CardTitle className="text-danger-600">Zona de Peligro</CardTitle>
            <CardDescription>Acciones irreversibles</CardDescription>
          </div>
        </CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Eliminar Organización</p>
            <p className="text-xs text-text-secondary">Se eliminan todos los datos permanentemente</p>
          </div>
          <Button variant="danger" size="sm">Eliminar</Button>
        </div>
      </Card>

      {/* Umbrales de Monitoreo */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning-500" />
              Umbrales de Monitoreo
            </CardTitle>
            <CardDescription>Configuración de umbrales WARNING y CRITICAL</CardDescription>
          </div>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Métrica</TableHead>
              <TableHead>Warning</TableHead>
              <TableHead>Critical</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {thresholds.map((t) => (
              <TableRow key={t.metric}>
                <TableCell className="font-medium">{t.metric}</TableCell>
                <TableCell>
                  <span className="text-warning-600 dark:text-warning-400 font-semibold">{t.warning}</span>
                </TableCell>
                <TableCell>
                  <span className="text-danger-600 dark:text-danger-400 font-semibold">{t.critical}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end mt-6 pt-4 border-t border-border">
          <Button icon={Save}>Guardar Umbrales</Button>
        </div>
      </Card>

      {/* Política de Escalación */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-500" />
              Política de Escalación
            </CardTitle>
            <CardDescription>Niveles de escalación y tiempos de respuesta</CardDescription>
          </div>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nivel</TableHead>
              <TableHead>Timeout</TableHead>
              <TableHead>Destinatarios</TableHead>
              <TableHead>Auto-execute</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {escalationPolicy.map((p) => (
              <TableRow key={p.level}>
                <TableCell className="font-medium">{p.level}</TableCell>
                <TableCell>{p.timeout}</TableCell>
                <TableCell className="text-text-secondary">{p.recipients}</TableCell>
                <TableCell>
                  <Badge variant={p.autoExecute ? 'success' : 'danger'} dot>
                    {p.autoExecute ? 'Sí' : 'No'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Ventanas de Mantenimiento */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary-500" />
              Ventanas de Mantenimiento
            </CardTitle>
            <CardDescription>Períodos de mantenimiento programados</CardDescription>
          </div>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sistema</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {maintenanceWindows.map((w, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{w.system}</TableCell>
                <TableCell>{w.day}</TableCell>
                <TableCell>{w.time}</TableCell>
                <TableCell>{w.duration}</TableCell>
                <TableCell>
                  <Badge variant={w.status === 'active' ? 'success' : 'default'} dot>
                    {w.status === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary-500" />
              API Keys
            </CardTitle>
            <CardDescription>Claves para integraciones externas</CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-3">
          {apiKeys.map((apiKey) => (
            <div key={apiKey.name} className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary border border-border">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">{apiKey.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">Creada: {apiKey.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <code className="text-xs bg-surface-tertiary px-2 py-1 rounded font-mono text-text-secondary">
                  {apiKey.key}
                </code>
                <Badge variant={apiKey.status === 'active' ? 'success' : 'danger'} dot>
                  {apiKey.status === 'active' ? 'Activa' : 'Inactiva'}
                </Badge>
                <button
                  className="p-1.5 rounded-md hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
                  title="Copiar clave"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

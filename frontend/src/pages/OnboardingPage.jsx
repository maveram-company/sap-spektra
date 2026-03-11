import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Server, Database, Cloud, CheckCircle, Plus, Trash2, Wifi } from 'lucide-react';
import Header from '../components/layout/Header';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';

const STEPS = [
  { id: 1, title: 'Sistema', icon: Server, description: 'Información del sistema SAP' },
  { id: 2, title: 'Base de Datos', icon: Database, description: 'Configuración de base de datos' },
  { id: 3, title: 'Conexión', icon: Cloud, description: 'Datos de conexión AWS' },
  { id: 4, title: 'Confirmar', icon: CheckCircle, description: 'Revisar y confirmar' },
];

const SID_PATTERN = /^[A-Z][A-Z0-9]{2}$/;
const INSTANCE_NUMBER_PATTERN = /^\d{2}$/;
const CLIENT_PATTERN = /^\d{3}$/;

const INSTANCE_ROLE_OPTIONS = [
  { value: 'PAS', label: 'PAS' },
  { value: 'AAS', label: 'AAS' },
  { value: 'ASCS', label: 'ASCS' },
  { value: 'ERS', label: 'ERS' },
  { value: 'HANA Primary', label: 'HANA Primary' },
  { value: 'HANA Secondary', label: 'HANA Secondary' },
];

const createDefaultInstance = () => ({
  instanceNumber: '00',
  role: 'PAS',
  hostname: '',
  ip: '',
});

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [connectionTest, setConnectionTest] = useState({ testing: false, result: null });
  const navigate = useNavigate();
  const [form, setForm] = useState({
    systemId: '', sid: '', type: 'S/4HANA', environment: 'DEV', description: '',
    instanceNumber: '', client: '',
    dbType: 'SAP HANA 2.0', osType: 'Linux', host: '', port: '',
    instanceId: '', region: 'us-east-1', snsTopicArn: '', approverEmail: '',
    mode: 'TRIAL',
    instances: [createDefaultInstance()],
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Validación del SID
  const sidError = form.sid.length > 0 && !SID_PATTERN.test(form.sid)
    ? 'El SID debe tener 3 caracteres: primera letra (A-Z), seguida de 2 letras o dígitos (A-Z, 0-9)'
    : '';

  // Validación del número de instancia
  const instanceNumberError = form.instanceNumber.length > 0 && !INSTANCE_NUMBER_PATTERN.test(form.instanceNumber)
    ? 'El número de instancia debe ser 2 dígitos (00-99)'
    : '';

  // Validación del cliente/mandante
  const clientError = form.client.length > 0 && !CLIENT_PATTERN.test(form.client)
    ? 'El cliente debe ser un número de 3 dígitos (ej. 100, 200, 300)'
    : '';

  // Gestión de instancias múltiples
  const updateInstance = useCallback((index, field, value) => {
    setForm(prev => {
      const updated = [...prev.instances];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, instances: updated };
    });
  }, []);

  const addInstance = useCallback(() => {
    setForm(prev => ({
      ...prev,
      instances: [...prev.instances, createDefaultInstance()],
    }));
  }, []);

  const removeInstance = useCallback((index) => {
    setForm(prev => ({
      ...prev,
      instances: prev.instances.filter((_, i) => i !== index),
    }));
  }, []);

  // Test de conexión simulado
  const handleTestConnection = useCallback(async () => {
    setConnectionTest({ testing: true, result: null });
    await new Promise(r => setTimeout(r, 2000));
    // Simular éxito si hay instanceId y región
    const isSuccess = form.instanceId?.trim().length > 0 && form.region?.trim().length > 0;
    setConnectionTest({ testing: false, result: isSuccess ? 'success' : 'error' });
  }, [form.instanceId, form.region]);

  const handleSubmit = async () => {
    if (!form.systemId?.trim() || !form.sid?.trim() || !form.host?.trim()) {
      return;
    }
    // Validar patrón del SID
    if (!SID_PATTERN.test(form.sid)) {
      return;
    }
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    setSuccess(true);
    setSubmitting(false);
  };

  if (success) {
    return (
      <div>
        <Header title="Registro de Sistema" />
        <div className="flex items-center justify-center min-h-[500px]">
          <Card className="max-w-md text-center" padding="lg">
            <div className="w-16 h-16 rounded-2xl bg-success-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-success-600" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Sistema Registrado</h2>
            <p className="text-sm text-text-secondary mb-6">
              El sistema <strong>{form.sid}</strong> ha sido registrado exitosamente en modo <strong>{form.mode}</strong>.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/admin')}>Ir a Gestión</Button>
              <Button onClick={() => navigate(`/systems/${form.systemId}`)}>Ver Sistema</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Registrar Nuevo Sistema" subtitle="Wizard de configuración paso a paso" />
      <div className="p-6 max-w-3xl mx-auto">
        {/* Steps indicator */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step > s.id ? 'bg-success-600 text-white' :
                  step === s.id ? 'bg-primary-600 text-white' :
                  'bg-surface-tertiary text-text-tertiary'
                }`}>
                  {step > s.id ? <Check size={18} /> : s.id}
                </div>
                <div className="hidden sm:block">
                  <p className={`text-xs font-semibold ${step >= s.id ? 'text-text-primary' : 'text-text-tertiary'}`}>{s.title}</p>
                  <p className="text-[10px] text-text-tertiary">{s.description}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${step > s.id ? 'bg-success-500' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        <Card padding="lg">
          {/* Step 1: System Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Información del Sistema</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input label="System ID" value={form.systemId} onChange={(e) => update('systemId', e.target.value)} placeholder="SAP-ERP-P01" hint="Identificador único del sistema" />
                <Input
                  label="SID"
                  value={form.sid}
                  onChange={(e) => update('sid', e.target.value.toUpperCase())}
                  placeholder="EP1"
                  maxLength={3}
                  hint={sidError ? undefined : 'SAP System ID — 3 caracteres (ej. EP1, S4P)'}
                  error={sidError}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Número de Instancia"
                  value={form.instanceNumber}
                  onChange={(e) => update('instanceNumber', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="00"
                  maxLength={2}
                  hint={instanceNumberError ? undefined : 'Número de instancia SAP (00-99)'}
                  error={instanceNumberError}
                />
                <Input
                  label="Cliente (Mandante)"
                  value={form.client}
                  onChange={(e) => update('client', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="100"
                  maxLength={3}
                  hint={clientError ? undefined : 'SAP Client/Mandante (ej. 100)'}
                  error={clientError}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Select label="Tipo de Sistema" value={form.type} onChange={(e) => update('type', e.target.value)} options={[
                  { value: 'S/4HANA', label: 'S/4HANA' }, { value: 'ECC', label: 'ECC' },
                  { value: 'BW/4HANA', label: 'BW/4HANA' }, { value: 'SolMan 7.2', label: 'Solution Manager' },
                  { value: 'CRM 7.0', label: 'CRM' }, { value: 'GRC 12.0', label: 'GRC' },
                  { value: 'PI/PO 7.5', label: 'PI/PO' },
                ]} />
                <Select label="Ambiente" value={form.environment} onChange={(e) => update('environment', e.target.value)} options={[
                  { value: 'PRD', label: 'Producción (PRD)' }, { value: 'QAS', label: 'Calidad (QAS)' },
                  { value: 'DEV', label: 'Desarrollo (DEV)' },
                ]} />
              </div>
              <Input label="Descripción" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Sistema ERP principal de producción" />
              <Select label="Modo Inicial" value={form.mode} onChange={(e) => update('mode', e.target.value)} options={[
                { value: 'TRIAL', label: 'Trial — Monitoreo cada 30 min, sin ejecución real' },
                { value: 'PRODUCTION', label: 'Producción — Monitoreo cada 5 min, ejecución completa' },
              ]} />
            </div>
          )}

          {/* Step 2: Database + Multi-Instance */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Base de Datos</h3>
              <div className="grid grid-cols-2 gap-4">
                <Select label="Tipo de BD" value={form.dbType} onChange={(e) => update('dbType', e.target.value)} options={[
                  { value: 'SAP HANA 2.0', label: 'SAP HANA 2.0' }, { value: 'SAP ASE 16.0', label: 'SAP ASE 16.0' },
                  { value: 'Oracle 19c', label: 'Oracle 19c' }, { value: 'MSSQL 2019', label: 'MS SQL Server 2019' },
                  { value: 'DB2 11.5', label: 'IBM DB2 11.5' }, { value: 'MaxDB 7.9', label: 'MaxDB 7.9' },
                ]} />
                <Select label="Sistema Operativo" value={form.osType} onChange={(e) => update('osType', e.target.value)} options={[
                  { value: 'Linux', label: 'Linux (SLES/RHEL)' }, { value: 'Windows', label: 'Windows Server' },
                ]} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Host" value={form.host} onChange={(e) => update('host', e.target.value)} placeholder="10.0.1.10" />
                <Input label="Puerto" value={form.port} onChange={(e) => update('port', e.target.value)} placeholder="30015" />
              </div>

              {/* Sección de instancias múltiples */}
              <div className="mt-6 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">Instancias del Sistema</h4>
                    <p className="text-xs text-text-tertiary mt-0.5">Registre las instancias SAP asociadas a este sistema</p>
                  </div>
                  <Button variant="outline" size="sm" icon={Plus} onClick={addInstance}>
                    Agregar Instancia
                  </Button>
                </div>
                <div className="space-y-3">
                  {form.instances.map((inst, idx) => (
                    <div key={idx} className="bg-surface-tertiary rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-text-secondary">Instancia {idx + 1}</span>
                        {form.instances.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeInstance(idx)}
                            className="text-danger-500 hover:text-danger-700 transition-colors p-1 rounded hover:bg-danger-50"
                            aria-label={`Eliminar instancia ${idx + 1}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <Input
                          label="Nº Instancia"
                          value={inst.instanceNumber}
                          onChange={(e) => updateInstance(idx, 'instanceNumber', e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder="00"
                          maxLength={2}
                        />
                        <Select
                          label="Rol"
                          value={inst.role}
                          onChange={(e) => updateInstance(idx, 'role', e.target.value)}
                          options={INSTANCE_ROLE_OPTIONS}
                        />
                        <Input
                          label="Hostname"
                          value={inst.hostname}
                          onChange={(e) => updateInstance(idx, 'hostname', e.target.value)}
                          placeholder="sapapp01"
                        />
                        <Input
                          label="IP"
                          value={inst.ip}
                          onChange={(e) => updateInstance(idx, 'ip', e.target.value)}
                          placeholder="10.0.1.10"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Connection + Test */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Conexión AWS</h3>
              <Input label="EC2 Instance ID" value={form.instanceId} onChange={(e) => update('instanceId', e.target.value)} placeholder="i-0abc123def456789" />
              <Select label="Región AWS" value={form.region} onChange={(e) => update('region', e.target.value)} options={[
                { value: 'us-east-1', label: 'US East (N. Virginia)' }, { value: 'us-west-2', label: 'US West (Oregon)' },
                { value: 'eu-west-1', label: 'EU (Ireland)' }, { value: 'eu-central-1', label: 'EU (Frankfurt)' },
                { value: 'sa-east-1', label: 'South America (São Paulo)' },
              ]} />
              <Input label="SNS Topic ARN" value={form.snsTopicArn} onChange={(e) => update('snsTopicArn', e.target.value)} placeholder="arn:aws:sns:us-east-1:123456789:sap-alerts" hint="Opcional — para notificaciones" />
              <Input label="Email del Aprobador" value={form.approverEmail} onChange={(e) => update('approverEmail', e.target.value)} placeholder="admin@empresa.com" />

              {/* Test de conexión */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    icon={Wifi}
                    loading={connectionTest.testing}
                    disabled={connectionTest.testing}
                    onClick={handleTestConnection}
                  >
                    {connectionTest.testing ? 'Probando conexión...' : 'Probar Conexión'}
                  </Button>
                  {connectionTest.result === 'success' && (
                    <div className="flex items-center gap-1.5 text-success-600">
                      <CheckCircle size={16} />
                      <span className="text-sm font-medium">Conexión exitosa</span>
                    </div>
                  )}
                  {connectionTest.result === 'error' && (
                    <div className="flex items-center gap-1.5 text-danger-600">
                      <span className="text-sm font-medium">Error de conexión — verifique el Instance ID y la región</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-text-tertiary mt-2">
                  Simula una prueba de conectividad hacia la instancia EC2 configurada
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">Confirmar Registro</h3>
              <div className="bg-surface-tertiary rounded-lg p-4 space-y-3 text-sm">
                {[
                  ['System ID', form.systemId], ['SID', form.sid],
                  ['Número de Instancia', form.instanceNumber || '—'],
                  ['Cliente (Mandante)', form.client || '—'],
                  ['Tipo', form.type],
                  ['Ambiente', form.environment], ['Base de Datos', form.dbType],
                  ['OS', form.osType], ['Host', form.host || '—'], ['Puerto', form.port || '—'],
                  ['Instance ID', form.instanceId || '—'], ['Región', form.region], ['Modo', form.mode],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-text-secondary">{label}:</span>
                    <span className="font-medium text-text-primary">{value}</span>
                  </div>
                ))}
              </div>

              {/* Resumen de instancias */}
              {form.instances.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-text-primary mb-2">Instancias Registradas</h4>
                  <div className="bg-surface-tertiary rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary">Nº</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary">Rol</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary">Hostname</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.instances.map((inst, idx) => (
                          <tr key={idx} className={idx < form.instances.length - 1 ? 'border-b border-border' : ''}>
                            <td className="px-4 py-2 text-text-primary">{inst.instanceNumber || '—'}</td>
                            <td className="px-4 py-2 text-text-primary">{inst.role}</td>
                            <td className="px-4 py-2 text-text-primary">{inst.hostname || '—'}</td>
                            <td className="px-4 py-2 text-text-primary">{inst.ip || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => step > 1 ? setStep(step - 1) : navigate('/admin')} >
              {step === 1 ? 'Cancelar' : 'Anterior'}
            </Button>
            {step < 4 ? (
              <Button icon={ArrowRight} onClick={() => setStep(step + 1)}>Siguiente</Button>
            ) : (
              <Button
                icon={CheckCircle}
                loading={submitting}
                disabled={!form.systemId?.trim() || !form.sid?.trim() || !form.host?.trim() || !SID_PATTERN.test(form.sid)}
                onClick={handleSubmit}
              >
                Registrar Sistema
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

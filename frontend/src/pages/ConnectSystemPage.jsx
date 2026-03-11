import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle, Server, Cloud, Shield,
  Terminal, Monitor, Download, Copy, Wifi, WifiOff, RefreshCw,
  Globe, AlertTriangle, Loader2,
} from 'lucide-react';
import Header from '../components/layout/Header';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

// ── Constantes ──

const CONNECTION_METHODS = {
  AGENT: {
    id: 'AGENT',
    title: 'Spektra Agent',
    subtitle: 'Para sistemas on-premise o en cloud IaaS',
    description: 'Instala un agente ligero en el servidor SAP que recopila métricas de OS, SAP y base de datos. Compatible con Linux, Windows, AIX, HP-UX y Solaris.',
    icon: Terminal,
    features: [
      'Monitoreo completo: OS + SAP + Base de Datos',
      'Operaciones HA/DR automatizadas',
      'Encriptación de credenciales con AES-256',
      'Compatible con 5 sistemas operativos',
    ],
    environments: ['On-Premise', 'AWS EC2', 'Azure VM', 'GCP Compute'],
  },
  CLOUD_CONNECTOR: {
    id: 'CLOUD_CONNECTOR',
    title: 'SAP Cloud Connector',
    subtitle: 'Para sistemas SAP RISE / BTP',
    description: 'Conecta sistemas gestionados por SAP RISE mediante SAP Cloud Connector. No requiere instalación de agente — usa el túnel seguro existente de BTP.',
    icon: Cloud,
    features: [
      'Sin instalación en el servidor SAP',
      'Usa la infraestructura BTP existente',
      'Túnel seguro vía Cloud Connector',
      'Ideal para entornos SAP RISE',
    ],
    environments: ['SAP RISE', 'SAP BTP', 'SAP HEC'],
  },
};

const OS_OPTIONS = [
  { value: 'linux', label: 'Linux (SLES / RHEL / Ubuntu)', icon: '🐧' },
  { value: 'windows', label: 'Windows Server', icon: '🪟' },
  { value: 'aix', label: 'IBM AIX', icon: '🖥️' },
  { value: 'hpux', label: 'HP-UX', icon: '🖥️' },
  { value: 'solaris', label: 'Oracle Solaris', icon: '☀️' },
];

const CLOUD_PROVIDER_OPTIONS = [
  { value: 'onprem', label: 'On-Premise (Data Center propio)' },
  { value: 'aws', label: 'Amazon Web Services (AWS)' },
  { value: 'azure', label: 'Microsoft Azure' },
  { value: 'gcp', label: 'Google Cloud Platform (GCP)' },
];

const SAP_TYPE_OPTIONS = [
  { value: 'S/4HANA', label: 'S/4HANA' },
  { value: 'ECC', label: 'ECC 6.0' },
  { value: 'BW/4HANA', label: 'BW/4HANA' },
  { value: 'SolMan 7.2', label: 'Solution Manager' },
  { value: 'CRM 7.0', label: 'CRM' },
  { value: 'GRC 12.0', label: 'GRC' },
  { value: 'PI/PO 7.5', label: 'PI/PO' },
];

const ENV_OPTIONS = [
  { value: 'PRD', label: 'Producción (PRD)' },
  { value: 'QAS', label: 'Calidad (QAS)' },
  { value: 'DEV', label: 'Desarrollo (DEV)' },
  { value: 'SBX', label: 'Sandbox (SBX)' },
  { value: 'DR', label: 'Disaster Recovery (DR)' },
];

const DB_OPTIONS = [
  { value: 'SAP HANA 2.0', label: 'SAP HANA 2.0' },
  { value: 'SAP ASE 16.0', label: 'SAP ASE 16.0' },
  { value: 'Oracle 19c', label: 'Oracle 19c' },
  { value: 'MSSQL 2019', label: 'MS SQL Server 2019' },
  { value: 'DB2 11.5', label: 'IBM DB2 11.5' },
  { value: 'MaxDB 7.9', label: 'MaxDB 7.9' },
];

const SID_PATTERN = /^[A-Z][A-Z0-9]{2}$/;

// ── Componentes auxiliares ──

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center flex-1">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              current > s.id ? 'bg-success-600 text-white' :
              current === s.id ? 'bg-primary-600 text-white' :
              'bg-surface-tertiary text-text-tertiary'
            }`}>
              {current > s.id ? <Check size={18} /> : s.id}
            </div>
            <div className="hidden sm:block">
              <p className={`text-xs font-semibold ${current >= s.id ? 'text-text-primary' : 'text-text-tertiary'}`}>{s.title}</p>
              <p className="text-[10px] text-text-tertiary">{s.description}</p>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-3 ${current > s.id ? 'bg-success-500' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ title, code, onCopy }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-tertiary border-b border-border">
        <span className="text-xs font-semibold text-text-secondary">{title}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-400 transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono text-text-primary bg-surface overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}

function FeatureList({ features }) {
  return (
    <ul className="space-y-2">
      {features.map((f, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
          <CheckCircle size={16} className="text-success-500 flex-shrink-0 mt-0.5" />
          {f}
        </li>
      ))}
    </ul>
  );
}

// ── Steps por path ──

const AGENT_STEPS = [
  { id: 1, title: 'Servidor', icon: Server, description: 'OS y proveedor cloud' },
  { id: 2, title: 'Instalación', icon: Download, description: 'Instalar el agente' },
  { id: 3, title: 'Sistema SAP', icon: Monitor, description: 'Información del sistema' },
  { id: 4, title: 'Verificar', icon: Wifi, description: 'Confirmar conexión' },
];

const SCC_STEPS = [
  { id: 1, title: 'Cloud Connector', icon: Cloud, description: 'Configurar SCC' },
  { id: 2, title: 'Sistema SAP', icon: Monitor, description: 'Información del sistema' },
  { id: 3, title: 'Verificar', icon: Wifi, description: 'Confirmar conexión' },
];

// ── Generador de comandos de instalación ──

function getInstallCommands(os) {
  if (os === 'windows') {
    return {
      download: `# Descargar el instalador de Spektra Agent
Invoke-WebRequest -Uri "https://releases.spektra.maveram.com/agent/latest/install.ps1" -OutFile install.ps1`,
      install: `# Ejecutar como Administrador
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\\install.ps1`,
      setup: `# Configurar credenciales SAP y base de datos
cd "C:\\ProgramData\\spektra-agent"
.\\venv\\Scripts\\python.exe -m spektra_agent --setup`,
      verify: `# Verificar que el servicio está corriendo
Get-Service SpektraAgent`,
    };
  }
  // Linux/AIX/HP-UX/Solaris
  const sudoPrefix = os === 'linux' ? 'sudo ' : '';
  return {
    download: `# Descargar el instalador
curl -fsSL https://releases.spektra.maveram.com/agent/latest/install.sh -o install.sh
chmod +x install.sh`,
    install: `# Ejecutar como root
${sudoPrefix}./install.sh`,
    setup: `# Configurar credenciales SAP y base de datos
${sudoPrefix}/opt/spektra-agent/venv/bin/python -m spektra_agent --setup`,
    verify: `# Verificar que el servicio está corriendo
${os === 'linux' ? 'systemctl status spektra-agent' : 'ps -ef | grep spektra'}`,
  };
}

// ── Componente principal ──

export default function ConnectSystemPage() {
  const navigate = useNavigate();

  // Estado global
  const [method, setMethod] = useState(null); // 'AGENT' | 'CLOUD_CONNECTOR'
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [connectionTest, setConnectionTest] = useState({ testing: false, result: null });

  // Campos Agent
  const [agentForm, setAgentForm] = useState({
    os: 'linux',
    provider: 'onprem',
    sid: '',
    type: 'S/4HANA',
    environment: 'PRD',
    dbType: 'SAP HANA 2.0',
    description: '',
    host: '',
  });

  // Campos Cloud Connector
  const [sccForm, setSccForm] = useState({
    locationId: '',
    subaccount: '',
    virtualHost: '',
    virtualPort: '443',
    protocol: 'HTTPS',
    sid: '',
    type: 'S/4HANA',
    environment: 'PRD',
    dbType: 'SAP HANA 2.0',
    description: '',
  });

  const updateAgent = useCallback((field, value) =>
    setAgentForm(prev => ({ ...prev, [field]: value })), []);
  const updateScc = useCallback((field, value) =>
    setSccForm(prev => ({ ...prev, [field]: value })), []);

  // Test de conexión simulado
  const handleTestConnection = useCallback(async () => {
    setConnectionTest({ testing: true, result: null });
    await new Promise(r => setTimeout(r, 2500));
    setConnectionTest({ testing: false, result: 'success' });
  }, []);

  // Submit final
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    setSuccess(true);
    setSubmitting(false);
  }, []);

  const currentSid = method === 'AGENT' ? agentForm.sid : sccForm.sid;

  // ── Pantalla de éxito ──
  if (success) {
    return (
      <div>
        <Header title="Conectar Sistema" />
        <div className="flex items-center justify-center min-h-[500px]">
          <Card className="max-w-md text-center" padding="lg">
            <div className="w-16 h-16 rounded-2xl bg-success-50 dark:bg-success-900/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-success-600" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Sistema Conectado</h2>
            <p className="text-sm text-text-secondary mb-2">
              El sistema <strong>{currentSid}</strong> se ha registrado exitosamente
              vía <strong>{method === 'AGENT' ? 'Spektra Agent' : 'Cloud Connector'}</strong>.
            </p>
            <p className="text-xs text-text-tertiary mb-6">
              Los datos comenzarán a aparecer en el dashboard en los próximos minutos.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/connectors')}>Ver Conectores</Button>
              <Button onClick={() => navigate('/systems')}>Ver Sistemas</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Selector de método (pantalla inicial) ──
  if (!method) {
    return (
      <div>
        <Header title="Conectar Nuevo Sistema" subtitle="Selecciona el método de conexión para tu sistema SAP" />
        <div className="p-6 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              ¿Cómo está desplegado tu sistema SAP?
            </h2>
            <p className="text-sm text-text-secondary max-w-lg mx-auto">
              Elige el método de conexión según la infraestructura donde corre tu sistema.
              Esto determinará cómo SAP Spektra se comunica con él.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.values(CONNECTION_METHODS).map((m) => {
              const Icon = m.icon;
              return (
                <Card
                  key={m.id}
                  hover
                  onClick={() => setMethod(m.id)}
                  className="cursor-pointer group transition-all duration-200 hover:border-primary-500/30"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Icon size={24} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-text-primary">{m.title}</h3>
                      <p className="text-xs text-text-tertiary">{m.subtitle}</p>
                    </div>
                  </div>

                  <p className="text-sm text-text-secondary mb-4">{m.description}</p>

                  <FeatureList features={m.features} />

                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Entornos compatibles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.environments.map(env => (
                        <Badge key={env} variant="outline" size="sm">{env}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button variant="outline" className="w-full group-hover:bg-primary-600 group-hover:text-white group-hover:border-primary-600 transition-all">
                      Seleccionar {m.title}
                      <ArrowRight size={16} className="ml-2" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 text-center">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>
              Volver
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Flujo AGENT ──
  if (method === 'AGENT') {
    const steps = AGENT_STEPS;
    const cmds = getInstallCommands(agentForm.os);
    const sidError = agentForm.sid.length > 0 && !SID_PATTERN.test(agentForm.sid) ? 'SID: 3 caracteres, primera letra A-Z' : '';

    return (
      <div>
        <Header title="Conectar vía Spektra Agent" subtitle="Instalación del agente en el servidor SAP" />
        <div className="p-6 max-w-3xl mx-auto">
          <StepIndicator steps={steps} current={step} />

          <Card padding="lg">
            {/* Step 1: OS + Cloud */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Servidor Destino</h3>
                  <p className="text-sm text-text-secondary">¿En qué sistema operativo y dónde corre tu servidor SAP?</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-text-primary mb-3 block">Sistema Operativo</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {OS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateAgent('os', opt.value)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                          agentForm.os === opt.value
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-border hover:border-primary-300 hover:bg-surface-secondary'
                        }`}
                      >
                        <span className="text-lg">{opt.icon}</span>
                        <span className={`text-sm font-medium ${
                          agentForm.os === opt.value ? 'text-primary-600' : 'text-text-primary'
                        }`}>{opt.label}</span>
                        {agentForm.os === opt.value && (
                          <CheckCircle size={16} className="text-primary-500 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <Select
                  label="Proveedor de Infraestructura"
                  value={agentForm.provider}
                  onChange={(e) => updateAgent('provider', e.target.value)}
                  options={CLOUD_PROVIDER_OPTIONS}
                />

                {agentForm.provider !== 'onprem' && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800">
                    <Shield size={16} className="text-accent-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-text-primary">Permisos Cloud</p>
                      <p className="text-xs text-text-secondary">
                        Si planeas usar operaciones HA/DR (failover, scale-up), el agente necesitará permisos
                        IAM de {agentForm.provider === 'aws' ? 'AWS' : agentForm.provider === 'azure' ? 'Azure' : 'GCP'}.
                        El wizard de setup (<code>--setup</code>) valida estos permisos automáticamente.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Installation Commands */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Instrucciones de Instalación</h3>
                  <p className="text-sm text-text-secondary">
                    Ejecuta estos comandos en tu servidor
                    {agentForm.os === 'windows' ? ' (PowerShell como Administrador)' : ' (como root o con sudo)'}
                  </p>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="primary" size="sm">
                    {OS_OPTIONS.find(o => o.value === agentForm.os)?.label}
                  </Badge>
                  <Badge variant="outline" size="sm">
                    {CLOUD_PROVIDER_OPTIONS.find(o => o.value === agentForm.provider)?.label}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                      Descargar el instalador
                    </p>
                    <CodeBlock title={agentForm.os === 'windows' ? 'PowerShell' : 'Bash'} code={cmds.download} />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                      Ejecutar la instalación
                    </p>
                    <CodeBlock title={agentForm.os === 'windows' ? 'PowerShell (Admin)' : 'Bash'} code={cmds.install} />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                      Configurar credenciales (wizard interactivo)
                    </p>
                    <CodeBlock title={agentForm.os === 'windows' ? 'PowerShell' : 'Bash'} code={cmds.setup} />
                    <p className="text-xs text-text-tertiary mt-1.5">
                      El wizard te guiará para configurar: URL del API, credenciales SAP, base de datos, y permisos cloud si aplica.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white flex items-center justify-center text-[10px] font-bold">4</span>
                      Verificar el servicio
                    </p>
                    <CodeBlock title={agentForm.os === 'windows' ? 'PowerShell' : 'Bash'} code={cmds.verify} />
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                  <AlertTriangle size={16} className="text-warning-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-text-primary">Requisitos previos</p>
                    <ul className="text-xs text-text-secondary mt-1 space-y-0.5">
                      <li>• Python 3.8 o superior instalado en el servidor</li>
                      <li>• Acceso de red al API de SAP Spektra (puerto 443)</li>
                      <li>• Usuario <code>{'<sid>'}adm</code> con acceso a sapcontrol</li>
                      {agentForm.os === 'windows' && <li>• PowerShell 5.1+ y permisos de Administrador</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: SAP System Info */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Información del Sistema SAP</h3>
                  <p className="text-sm text-text-secondary">Datos del sistema que el agente monitoreará</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="SID"
                    value={agentForm.sid}
                    onChange={(e) => updateAgent('sid', e.target.value.toUpperCase())}
                    placeholder="EP1"
                    maxLength={3}
                    hint={sidError ? undefined : 'SAP System ID (ej. EP1, S4P)'}
                    error={sidError}
                  />
                  <Select
                    label="Tipo de Sistema"
                    value={agentForm.type}
                    onChange={(e) => updateAgent('type', e.target.value)}
                    options={SAP_TYPE_OPTIONS}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Ambiente"
                    value={agentForm.environment}
                    onChange={(e) => updateAgent('environment', e.target.value)}
                    options={ENV_OPTIONS}
                  />
                  <Select
                    label="Base de Datos"
                    value={agentForm.dbType}
                    onChange={(e) => updateAgent('dbType', e.target.value)}
                    options={DB_OPTIONS}
                  />
                </div>

                <Input
                  label="Hostname / IP del servidor"
                  value={agentForm.host}
                  onChange={(e) => updateAgent('host', e.target.value)}
                  placeholder="sap-ep1-app01 o 10.0.1.10"
                />

                <Input
                  label="Descripción"
                  value={agentForm.description}
                  onChange={(e) => updateAgent('description', e.target.value)}
                  placeholder="Sistema ERP principal de producción"
                />
              </div>
            )}

            {/* Step 4: Verify Connection */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Verificar Conexión</h3>
                  <p className="text-sm text-text-secondary">
                    Confirma que el agente está enviando datos correctamente
                  </p>
                </div>

                {/* Resumen */}
                <div className="bg-surface-tertiary rounded-lg p-4 space-y-2 text-sm">
                  {[
                    ['SID', agentForm.sid || '—'],
                    ['Tipo', agentForm.type],
                    ['Ambiente', agentForm.environment],
                    ['Base de Datos', agentForm.dbType],
                    ['Host', agentForm.host || '—'],
                    ['OS', OS_OPTIONS.find(o => o.value === agentForm.os)?.label || '—'],
                    ['Infraestructura', CLOUD_PROVIDER_OPTIONS.find(o => o.value === agentForm.provider)?.label || '—'],
                    ['Método', 'Spektra Agent'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-text-secondary">{label}:</span>
                      <span className="font-medium text-text-primary">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Test de conexión */}
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wifi size={18} className="text-text-secondary" />
                      <span className="text-sm font-semibold text-text-primary">Test de Conectividad</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={connectionTest.testing ? Loader2 : RefreshCw}
                      loading={connectionTest.testing}
                      disabled={connectionTest.testing}
                      onClick={handleTestConnection}
                    >
                      {connectionTest.testing ? 'Verificando...' : 'Probar Conexión'}
                    </Button>
                  </div>

                  {connectionTest.result === 'success' && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                      <CheckCircle size={18} className="text-success-600" />
                      <div>
                        <p className="text-sm font-semibold text-success-700 dark:text-success-400">Agente conectado</p>
                        <p className="text-xs text-text-secondary">Heartbeat recibido — latencia 28ms — versión v1.4.2</p>
                      </div>
                    </div>
                  )}

                  {connectionTest.result === 'error' && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800">
                      <WifiOff size={18} className="text-danger-600" />
                      <div>
                        <p className="text-sm font-semibold text-danger-700 dark:text-danger-400">Sin respuesta del agente</p>
                        <p className="text-xs text-text-secondary">Verifica que el servicio esté corriendo y tenga acceso de red</p>
                      </div>
                    </div>
                  )}

                  {!connectionTest.result && !connectionTest.testing && (
                    <p className="text-xs text-text-tertiary">
                      Haz clic en &quot;Probar Conexión&quot; para verificar que el agente esté enviando heartbeats.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
              <Button
                variant="ghost"
                icon={ArrowLeft}
                onClick={() => {
                  if (step === 1) { setMethod(null); }
                  else { setStep(step - 1); }
                }}
              >
                {step === 1 ? 'Cambiar método' : 'Anterior'}
              </Button>
              {step < 4 ? (
                <Button icon={ArrowRight} onClick={() => setStep(step + 1)}>Siguiente</Button>
              ) : (
                <Button
                  icon={CheckCircle}
                  loading={submitting}
                  disabled={!agentForm.sid?.trim() || !SID_PATTERN.test(agentForm.sid)}
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

  // ── Flujo CLOUD CONNECTOR ──
  if (method === 'CLOUD_CONNECTOR') {
    const steps = SCC_STEPS;
    const sidError = sccForm.sid.length > 0 && !SID_PATTERN.test(sccForm.sid) ? 'SID: 3 caracteres, primera letra A-Z' : '';

    return (
      <div>
        <Header title="Conectar vía Cloud Connector" subtitle="Configurar conexión desde SAP BTP / RISE" />
        <div className="p-6 max-w-3xl mx-auto">
          <StepIndicator steps={steps} current={step} />

          <Card padding="lg">
            {/* Step 1: SCC Configuration */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Configuración del Cloud Connector</h3>
                  <p className="text-sm text-text-secondary">
                    Datos de tu instancia de SAP Cloud Connector que conecta al sistema SAP
                  </p>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                  <Globe size={16} className="text-primary-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-text-primary">¿Qué es SAP Cloud Connector?</p>
                    <p className="text-xs text-text-secondary">
                      SAP Cloud Connector establece un túnel seguro entre tu red corporativa y SAP BTP.
                      Spektra lo utiliza para comunicarse con sistemas SAP RISE sin necesidad de instalar un agente.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Location ID"
                    value={sccForm.locationId}
                    onChange={(e) => updateScc('locationId', e.target.value)}
                    placeholder="LOC_DC1"
                    hint="Identificador de ubicación en el Cloud Connector"
                  />
                  <Input
                    label="Subaccount BTP"
                    value={sccForm.subaccount}
                    onChange={(e) => updateScc('subaccount', e.target.value)}
                    placeholder="maveram-prod"
                    hint="Subcuenta de SAP BTP vinculada"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Virtual Host"
                    value={sccForm.virtualHost}
                    onChange={(e) => updateScc('virtualHost', e.target.value)}
                    placeholder="sap-erp-prod:443"
                    hint="Host virtual configurado en el SCC"
                  />
                  <Input
                    label="Virtual Port"
                    value={sccForm.virtualPort}
                    onChange={(e) => updateScc('virtualPort', e.target.value)}
                    placeholder="443"
                  />
                </div>

                <Select
                  label="Protocolo"
                  value={sccForm.protocol}
                  onChange={(e) => updateScc('protocol', e.target.value)}
                  options={[
                    { value: 'HTTPS', label: 'HTTPS (recomendado)' },
                    { value: 'HTTP', label: 'HTTP' },
                    { value: 'RFC', label: 'RFC' },
                    { value: 'LDAP', label: 'LDAPS' },
                  ]}
                />

                <div className="mt-2 p-3 rounded-lg bg-surface-tertiary">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Requisitos previos</p>
                  <ul className="text-xs text-text-secondary space-y-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle size={12} className="text-success-500" />
                      SAP Cloud Connector instalado y conectado a BTP
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={12} className="text-success-500" />
                      Mapeo de sistema virtual configurado en el SCC
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={12} className="text-success-500" />
                      Subcuenta BTP con servicio Connectivity habilitado
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Step 2: SAP System Info */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Información del Sistema SAP</h3>
                  <p className="text-sm text-text-secondary">Datos del sistema SAP RISE que se conectará</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="SID"
                    value={sccForm.sid}
                    onChange={(e) => updateScc('sid', e.target.value.toUpperCase())}
                    placeholder="EP1"
                    maxLength={3}
                    hint={sidError ? undefined : 'SAP System ID (ej. EP1, S4P)'}
                    error={sidError}
                  />
                  <Select
                    label="Tipo de Sistema"
                    value={sccForm.type}
                    onChange={(e) => updateScc('type', e.target.value)}
                    options={SAP_TYPE_OPTIONS}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Ambiente"
                    value={sccForm.environment}
                    onChange={(e) => updateScc('environment', e.target.value)}
                    options={ENV_OPTIONS}
                  />
                  <Select
                    label="Base de Datos"
                    value={sccForm.dbType}
                    onChange={(e) => updateScc('dbType', e.target.value)}
                    options={DB_OPTIONS}
                  />
                </div>

                <Input
                  label="Descripción"
                  value={sccForm.description}
                  onChange={(e) => updateScc('description', e.target.value)}
                  placeholder="Sistema ERP RISE producción"
                />

                <div className="flex items-start gap-3 p-3 rounded-lg bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                  <AlertTriangle size={16} className="text-warning-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-text-secondary">
                    <strong>Nota:</strong> En SAP RISE, las operaciones HA/DR son gestionadas por SAP.
                    Spektra monitoreará el sistema pero no ejecutará operaciones de infraestructura directamente.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Verify Connection */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Verificar Conexión</h3>
                  <p className="text-sm text-text-secondary">Confirma la conectividad vía Cloud Connector</p>
                </div>

                {/* Resumen */}
                <div className="bg-surface-tertiary rounded-lg p-4 space-y-2 text-sm">
                  {[
                    ['SID', sccForm.sid || '—'],
                    ['Tipo', sccForm.type],
                    ['Ambiente', sccForm.environment],
                    ['Base de Datos', sccForm.dbType],
                    ['Location ID', sccForm.locationId || '—'],
                    ['Subaccount', sccForm.subaccount || '—'],
                    ['Virtual Host', sccForm.virtualHost || '—'],
                    ['Protocolo', sccForm.protocol],
                    ['Método', 'SAP Cloud Connector'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-text-secondary">{label}:</span>
                      <span className="font-medium text-text-primary">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Test */}
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Cloud size={18} className="text-text-secondary" />
                      <span className="text-sm font-semibold text-text-primary">Test de Túnel SCC</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={connectionTest.testing ? Loader2 : RefreshCw}
                      loading={connectionTest.testing}
                      disabled={connectionTest.testing}
                      onClick={handleTestConnection}
                    >
                      {connectionTest.testing ? 'Verificando...' : 'Probar Túnel'}
                    </Button>
                  </div>

                  {connectionTest.result === 'success' && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                      <CheckCircle size={18} className="text-success-600" />
                      <div>
                        <p className="text-sm font-semibold text-success-700 dark:text-success-400">Túnel activo</p>
                        <p className="text-xs text-text-secondary">Cloud Connector alcanzable — latencia 45ms — Location {sccForm.locationId || 'LOC_DC1'}</p>
                      </div>
                    </div>
                  )}

                  {!connectionTest.result && !connectionTest.testing && (
                    <p className="text-xs text-text-tertiary">
                      Verifica que el túnel del Cloud Connector esté activo para la conexión configurada.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
              <Button
                variant="ghost"
                icon={ArrowLeft}
                onClick={() => {
                  if (step === 1) { setMethod(null); setStep(1); }
                  else { setStep(step - 1); }
                }}
              >
                {step === 1 ? 'Cambiar método' : 'Anterior'}
              </Button>
              {step < 3 ? (
                <Button icon={ArrowRight} onClick={() => setStep(step + 1)}>Siguiente</Button>
              ) : (
                <Button
                  icon={CheckCircle}
                  loading={submitting}
                  disabled={!sccForm.sid?.trim() || !SID_PATTERN.test(sccForm.sid)}
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

  return null;
}

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, XCircle, Plug, WifiOff, Plus } from 'lucide-react';
import Header from '../components/layout/Header';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { mockConnectors } from '../lib/mockData';

// ── Helpers ──

function ConnectionStatusIcon({ status }) {
  if (status === 'connected') return <CheckCircle size={16} className="text-success-500" />;
  if (status === 'degraded') return <AlertTriangle size={16} className="text-warning-500" />;
  return <XCircle size={16} className="text-danger-500" />;
}

function ConnectionMethodBadge({ method }) {
  const variants = {
    'SAP Cloud Connector': 'primary',
    'Spektra Agent': 'info',
    'RFC/BAPI': 'warning',
    'API Gateway': 'success',
  };
  return <Badge variant={variants[method] || 'outline'} size="sm">{method}</Badge>;
}

function formatHeartbeat(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return `Hace ${hrs}h ${remainMins > 0 ? `${remainMins}m` : ''}`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d ${hrs % 24}h`;
}

function LatencyCell({ ms }) {
  if (ms == null) return <span className="text-text-tertiary">—</span>;
  const color = ms < 100 ? 'text-success-600' : ms < 250 ? 'text-warning-600' : 'text-danger-600';
  return <span className={`font-mono font-semibold ${color}`}>{ms} ms</span>;
}

// ── Orden: desconectados → degradados → conectados ──
const STATUS_ORDER = { disconnected: 0, degraded: 1, connected: 2 };

export default function ConnectorsPage() {
  const navigate = useNavigate();
  const connected = useMemo(() => mockConnectors.filter(c => c.status === 'connected').length, []);
  const degraded = useMemo(() => mockConnectors.filter(c => c.status === 'degraded').length, []);
  const disconnected = useMemo(() => mockConnectors.filter(c => c.status === 'disconnected').length, []);
  const total = mockConnectors.length;

  const sorted = useMemo(() =>
    [...mockConnectors].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
  []);

  return (
    <div>
      <Header
        title="Conectores"
        subtitle="Conexiones de tus sistemas SAP con Spektra (datos de demostración)"
        actions={
          <Button icon={Plus} onClick={() => navigate('/connect')}>
            Conectar Sistema
          </Button>
        }
      />
      <div className="p-6 space-y-6">

        {/* KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Plug size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{total}</p>
                <p className="text-xs text-text-secondary">Total Conexiones</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <CheckCircle size={20} className="text-success-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success-600">{connected}</p>
                <p className="text-xs text-text-secondary">Conectados</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-warning-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning-600">{degraded}</p>
                <p className="text-xs text-text-secondary">Degradados</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center">
                <XCircle size={20} className="text-danger-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-danger-600">{disconnected}</p>
                <p className="text-xs text-text-secondary">Desconectados</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Alerta de desconexión */}
        {disconnected > 0 && (
          <Card className="border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-danger-100 dark:bg-danger-900/40 flex items-center justify-center">
                <WifiOff size={20} className="text-danger-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {disconnected} conexi{disconnected > 1 ? 'ones' : 'ón'} sin respuesta
                </p>
                <p className="text-xs text-text-secondary">
                  Verificar estado del agente o Cloud Connector en los sistemas afectados.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Tabla de conexiones */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="flex items-center gap-2">
              <Plug size={18} />
              Conexiones SAP
            </CardTitle>
            <Badge variant="primary" size="sm">{total} sistemas</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Estado</TableHead>
                <TableHead>SID</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Método de Conexión</TableHead>
                <TableHead>Latencia</TableHead>
                <TableHead>Último Heartbeat</TableHead>
                <TableHead>Mensajes (24h)</TableHead>
                <TableHead>Versión</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {sorted.map(conn => (
                <TableRow key={conn.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ConnectionStatusIcon status={conn.status} />
                      <span className={`text-xs font-medium capitalize ${
                        conn.status === 'connected' ? 'text-success-600' :
                        conn.status === 'degraded' ? 'text-warning-600' : 'text-danger-600'
                      }`}>
                        {conn.status === 'connected' ? 'Conectado' :
                         conn.status === 'degraded' ? 'Degradado' : 'Desconectado'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary" size="sm">{conn.sid}</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{conn.systemName}</p>
                      <p className="text-xs text-text-tertiary">{conn.systemType} — {conn.environment}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ConnectionMethodBadge method={conn.connectionMethod} />
                  </TableCell>
                  <TableCell>
                    <LatencyCell ms={conn.latencyMs} />
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {formatHeartbeat(conn.lastHeartbeat)}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {conn.messagesCollected24h.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {conn.agentVersion || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

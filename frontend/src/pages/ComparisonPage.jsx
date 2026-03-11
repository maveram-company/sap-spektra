import { useState, useEffect, useMemo } from 'react';
import { GitCompare, CheckCircle, AlertTriangle, Info, Server } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import HealthGauge from '../components/ui/HealthGauge';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Select';
import Table, { TableHeader, TableHead, TableBody, TableRow, TableCell } from '../components/ui/Table';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import FeatureGate, { UpgradeBanner } from '../components/ui/FeatureGate';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';

// Mapeo de entorno a variante de Badge
const envBadgeVariant = {
  DEV: 'info',
  QAS: 'warning',
  PRD: 'success',
};

// Orden de entornos para mostrar DEV -> QAS -> PRD
const envOrder = { DEV: 0, QAS: 1, PRD: 2 };

// Determina si un valor difiere del mayoritario en un conjunto
function hasDifference(values) {
  const unique = [...new Set(values)];
  return unique.length > 1;
}

export default function ComparisonPage() {
  const [systems, setSystems] = useState([]);
  const [sidLines, setSidLines] = useState([]);
  const [systemMeta, setSystemMeta] = useState({});
  const [landscapeValidation, setLandscapeValidation] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState('ERP');

  useEffect(() => {
    Promise.all([
      dataService.getSystems(),
      dataService.getSIDLines(),
      dataService.getSystemMeta(),
      dataService.getLandscapeValidation(),
    ]).then(([sys, lines, meta, validation]) => {
      setSystems(sys);
      setSidLines(lines);
      setSystemMeta(meta);
      setLandscapeValidation(validation);
      setLoading(false);
    });
  }, []);

  // Opciones del selector de SID Lines
  const lineOptions = useMemo(() =>
    sidLines.map(l => ({
      value: l.line,
      label: `${l.line} — ${l.description}`,
    })),
  [sidLines]);

  // Datos de la linea seleccionada
  const currentLine = useMemo(() =>
    sidLines.find(l => l.line === selectedLine),
  [selectedLine, sidLines]);

  // Sistemas de la linea seleccionada, ordenados DEV -> QAS -> PRD
  const lineSystems = useMemo(() => {
    if (!currentLine) return [];
    return currentLine.systems
      .map(id => systems.find(s => s.id === id))
      .filter(Boolean)
      .sort((a, b) => (envOrder[a.environment] ?? 99) - (envOrder[b.environment] ?? 99));
  }, [currentLine]);

  // Meta de cada sistema
  const lineSystemsMeta = useMemo(() => {
    const map = {};
    lineSystems.forEach(s => {
      map[s.id] = systemMeta[s.id] || {};
    });
    return map;
  }, [lineSystems]);

  // Datos de comparacion para el grafico de barras
  const comparisonData = useMemo(() => {
    if (lineSystems.length === 0) return [];
    return [
      { metric: 'Health Score', ...Object.fromEntries(lineSystems.map(s => [s.sid, s.healthScore])) },
      { metric: 'CPU (%)', ...Object.fromEntries(lineSystems.map(s => [s.sid, s.cpu])) },
      { metric: 'Memoria (%)', ...Object.fromEntries(lineSystems.map(s => [s.sid, s.mem])) },
      { metric: 'Disco (%)', ...Object.fromEntries(lineSystems.map(s => [s.sid, s.disk])) },
    ];
  }, [lineSystems]);

  const colors = ['#3b82f6', '#f59e0b', '#8b5cf6'];

  // Validacion de landscape (solo disponible para ERP)
  const landscapeData = landscapeValidation[selectedLine] || null;

  // Helper: color de fila segun status de check
  function checkStatusColor(status) {
    if (status === 'ok') return 'text-success-600 dark:text-success-400';
    if (status === 'warning') return 'text-warning-600 dark:text-warning-400';
    if (status === 'info') return 'text-blue-600 dark:text-blue-400';
    return 'text-danger-600 dark:text-danger-400';
  }

  function checkStatusIcon(status) {
    if (status === 'ok') return <CheckCircle size={14} className="text-success-500" />;
    if (status === 'warning') return <AlertTriangle size={14} className="text-warning-500" />;
    return <Info size={14} className="text-blue-500" />;
  }

  // Determina si un valor de metrica es el peor (mas alto para CPU/Mem/Disk, mas bajo para Health)
  function isMetricOutlier(metric, value, allValues) {
    if (!hasDifference(allValues)) return false;
    if (metric === 'healthScore') return value === Math.min(...allValues);
    return value === Math.max(...allValues);
  }

  if (loading) return <PageLoading message="Cargando comparación..." />;

  return (
    <div>
      <Header title="Comparacion" subtitle="Compara metricas entre sistemas de una misma linea SAP" />
      <div className="p-6">
        <PageHeader
          title="Comparacion de Landscape SAP"
          description="Selecciona una linea SID para comparar sus entornos (DEV / QAS / PRD)"
        />

        <FeatureGate feature="comparison" fallback={<UpgradeBanner feature="Comparacion de Sistemas" className="mb-6" />}>
          <>
            {/* Selector de linea SID */}
            <div className="mb-6 max-w-md">
              <Select
                label="Linea SID"
                options={lineOptions}
                value={selectedLine}
                onChange={(e) => setSelectedLine(e.target.value)}
              />
            </div>

            {lineSystems.length === 0 ? (
              <EmptyState
                icon={GitCompare}
                title="Sin sistemas"
                description="No se encontraron sistemas en esta linea SID."
              />
            ) : (
              <>
                {/* Tarjetas de comparacion por entorno */}
                <div className={`grid grid-cols-1 gap-4 mb-6 ${
                  lineSystems.length === 1 ? 'md:grid-cols-1 max-w-md' :
                  lineSystems.length === 2 ? 'md:grid-cols-2' :
                  'md:grid-cols-3'
                }`}>
                  {lineSystems.map((sys, i) => {
                    const meta = lineSystemsMeta[sys.id] || {};
                    const cpuValues = lineSystems.map(s => s.cpu);
                    const memValues = lineSystems.map(s => s.mem);
                    const diskValues = lineSystems.map(s => s.disk);

                    return (
                      <Card
                        key={sys.id}
                        className="text-center"
                        style={{ borderTopColor: colors[i], borderTopWidth: '3px' }}
                      >
                        {/* Encabezado con badge de entorno */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Server size={16} className="text-text-tertiary" />
                            <span className="text-sm font-semibold text-text-primary">{sys.sid}</span>
                          </div>
                          <Badge variant={envBadgeVariant[sys.environment] || 'default'} size="md">
                            {sys.environment}
                          </Badge>
                        </div>

                        <p className="text-xs text-text-secondary mb-4">{sys.type} — {sys.description}</p>

                        {/* Gauge de Health Score */}
                        <div className="flex justify-center mb-4">
                          <HealthGauge score={sys.healthScore} size={120} />
                        </div>

                        <div className="mt-2 mb-3">
                          <StatusBadge status={sys.status} />
                        </div>

                        {/* Metricas clave */}
                        <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-3 mb-3">
                          <div>
                            <p className="text-[10px] text-text-tertiary uppercase">CPU</p>
                            <p className={`text-sm font-bold ${
                              isMetricOutlier('cpu', sys.cpu, cpuValues)
                                ? 'text-danger-600 dark:text-danger-400'
                                : 'text-text-primary'
                            }`}>
                              {sys.cpu}%
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-text-tertiary uppercase">Memoria</p>
                            <p className={`text-sm font-bold ${
                              isMetricOutlier('mem', sys.mem, memValues)
                                ? 'text-danger-600 dark:text-danger-400'
                                : 'text-text-primary'
                            }`}>
                              {sys.mem}%
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-text-tertiary uppercase">Disco</p>
                            <p className={`text-sm font-bold ${
                              isMetricOutlier('disk', sys.disk, diskValues)
                                ? 'text-danger-600 dark:text-danger-400'
                                : 'text-text-primary'
                            }`}>
                              {sys.disk}%
                            </p>
                          </div>
                        </div>

                        {/* Info SAP (Release, Kernel, Notes) */}
                        <div className="border-t border-border pt-3 text-left space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-text-tertiary">SAP Release</span>
                            <span className={`font-medium ${
                              hasDifference(lineSystems.map(s => (lineSystemsMeta[s.id] || {}).sapRelease))
                                ? 'text-warning-600 dark:text-warning-400'
                                : 'text-text-primary'
                            }`}>
                              {meta.sapRelease || '—'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-tertiary">Kernel</span>
                            <span className={`font-medium ${
                              hasDifference(lineSystems.map(s => (lineSystemsMeta[s.id] || {}).kernelRelease))
                                ? 'text-warning-600 dark:text-warning-400'
                                : 'text-text-primary'
                            }`}>
                              {meta.kernelRelease || '—'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-tertiary">SAP Notes</span>
                            <span className={`font-medium ${
                              hasDifference(lineSystems.map(s => (lineSystemsMeta[s.id] || {}).sapNotes))
                                ? 'text-warning-600 dark:text-warning-400'
                                : 'text-text-primary'
                            }`}>
                              {meta.sapNotes ?? '—'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-tertiary">Cliente</span>
                            <span className="font-medium text-text-primary">
                              {meta.client || '—'}
                            </span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Grafico de barras comparativo */}
                {lineSystems.length > 1 && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Comparacion de Metricas</CardTitle>
                    </CardHeader>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="metric" stroke="var(--color-text-tertiary)" fontSize={11} />
                          <YAxis stroke="var(--color-text-tertiary)" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                          />
                          <Legend />
                          {lineSystems.map((s, i) => (
                            <Bar
                              key={s.id}
                              dataKey={s.sid}
                              fill={colors[i]}
                              name={`${s.sid} (${s.environment})`}
                              radius={[4, 4, 0, 0]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {/* Seccion de Consistencia de Landscape (solo si hay datos de validacion) */}
                {landscapeData && lineSystems.length > 1 && (
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>Consistencia de Landscape</CardTitle>
                        <p className="text-xs text-text-secondary mt-1">
                          Validacion cruzada de configuraciones entre entornos —
                          Ultima verificacion: {new Date(landscapeData.lastValidated).toLocaleString('es-CO')}
                        </p>
                      </div>
                      <Badge
                        variant={landscapeData.overallStatus === 'ok' ? 'success' : landscapeData.overallStatus === 'warning' ? 'warning' : 'danger'}
                        size="lg"
                      >
                        {landscapeData.overallStatus === 'ok' ? 'Consistente' : landscapeData.overallStatus === 'warning' ? 'Con advertencias' : 'Inconsistente'}
                      </Badge>
                    </CardHeader>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Verificacion</TableHead>
                          <TableHead>DEV</TableHead>
                          <TableHead>QAS</TableHead>
                          <TableHead>PRD</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {landscapeData.checks.map((check, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <div>
                                <span className="font-medium">{check.name}</span>
                                {check.detail && (
                                  <p className="text-[10px] text-text-tertiary mt-0.5">{check.detail}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm ${
                                check.status !== 'ok' && String(check.devValue) !== String(check.prdValue)
                                  ? 'text-warning-600 dark:text-warning-400 font-medium'
                                  : ''
                              }`}>
                                {check.devValue}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm ${
                                check.status !== 'ok' && String(check.qasValue) !== String(check.prdValue)
                                  ? 'text-warning-600 dark:text-warning-400 font-medium'
                                  : ''
                              }`}>
                                {check.qasValue}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm ${
                                check.status !== 'ok' && (String(check.prdValue) !== String(check.devValue) || String(check.prdValue) !== String(check.qasValue))
                                  ? 'text-danger-600 dark:text-danger-400 font-medium'
                                  : ''
                              }`}>
                                {check.prdValue}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className={`flex items-center gap-1.5 ${checkStatusColor(check.status)}`}>
                                {checkStatusIcon(check.status)}
                                <span className="text-xs font-medium uppercase">{check.status}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}

                {/* Mensaje informativo para lineas con un solo sistema */}
                {lineSystems.length === 1 && (
                  <Card className="text-center">
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Info size={24} className="text-text-tertiary" />
                      <p className="text-sm text-text-secondary">
                        Esta linea SID solo contiene un sistema ({lineSystems[0].environment}).
                        La comparacion de landscape requiere al menos dos entornos (DEV/QAS/PRD).
                      </p>
                    </div>
                  </Card>
                )}
              </>
            )}
          </>
        </FeatureGate>
      </div>
    </div>
  );
}

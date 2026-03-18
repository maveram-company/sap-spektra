import { useState, useRef, useEffect } from 'react';
import { FileText, Download, Calendar, TrendingUp, HeartPulse, ShieldCheck, Loader2, CheckCircle, X } from 'lucide-react';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { dataService } from '../services/dataService';
import { useToast } from '../hooks/useToast';
import { createLogger } from '../lib/logger';
import type { ApiRecord } from '../types';

const log = createLogger('ReportsPage');

// Tipos de reporte disponibles
const reportTypes = [
  { key: 'diario', label: 'Diario', description: 'Últimas 24h', icon: Calendar, color: 'primary' },
  { key: 'semanal', label: 'Semanal', description: 'Tendencias 7 días', icon: TrendingUp, color: 'info' },
  { key: 'salud', label: 'Salud', description: 'Estado infra completo', icon: HeartPulse, color: 'success' },
  { key: 'auditoria', label: 'Auditoría', description: 'Hash chain inmutable', icon: ShieldCheck, color: 'warning' },
];

// Colores de fondo para cada tipo de tarjeta
const cardColors = {
  primary: 'bg-primary-100/50 dark:bg-primary-900/20',
  info: 'bg-blue-100/50 dark:bg-blue-900/20',
  success: 'bg-success-50/50 dark:bg-success-900/20',
  warning: 'bg-warning-50/50 dark:bg-warning-900/20',
};

const iconColors = {
  primary: 'text-primary-600 dark:text-primary-400',
  info: 'text-blue-600 dark:text-blue-400',
  success: 'text-success-600 dark:text-success-400',
  warning: 'text-warning-600 dark:text-warning-400',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<ApiRecord[]>([]);
  const [events, setEvents] = useState<ApiRecord[]>([]);
  const [alerts, setAlerts] = useState<ApiRecord[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast(3000);
  const [error, setError] = useState<string | null>(null);
  const generateTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let mounted = true;
    Promise.all([dataService.getEvents(), dataService.getAlerts()]).then(([evts, alts]) => {
      if (!mounted) return;
      setEvents(evts);
      setAlerts(alts);
    }).catch((err: any) => {
      log.warn('Fetch failed', { error: err.message });
      if (!mounted) return;
      setError('Error al cargar datos. Intenta de nuevo.');
    });
    return () => {
      mounted = false;
      clearTimeout(generateTimerRef.current);
    };
  }, []);

  // Generar reporte
  const handleGenerate = async (typeKey: any) => {
    if (generating) return;
    setGenerating(typeKey);
    try {
      // Demo mode: simulated delay — connect to real API when available
      await new Promise<void>((resolve: any, reject: any) => {
        generateTimerRef.current = setTimeout(() => resolve(), 1500);
      });
      const now = new Date();
      const newReport = {
        id: `RPT-${String(reports.length + 1).padStart(3, '0')}`,
        fecha: now.toISOString(),
        tipo: typeKey,
        estado: 'OK',
      };
      setReports((prev) => [newReport, ...prev]);
      showToast(`Reporte ${typeKey} generado exitosamente`, 'success');
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : 'Error al generar reporte', 'error');
    } finally {
      setGenerating(null);
    }
  };

  // Descargar reporte como JSON
  const handleDownload = (report: any) => {
    const reportData = {
      id: report.id,
      type: report.tipo,
      generatedAt: report.fecha,
      summary: {
        systemsCount: 9,
        eventsCount: events.length,
        alertsCount: alerts.length,
        activeAlerts: alerts.filter((a: any) => a.status === 'active').length,
        resolvedAlerts: alerts.filter((a: any) => a.status === 'resolved').length,
      },
      status: report.estado,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}-${report.tipo}-${new Date(report.fecha).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Etiqueta legible del tipo
  const tipoLabel = (key: any) => {
    const found = reportTypes.find((r: any) => r.key === key);
    return found ? found.label : key;
  };

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
          Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <Header title="Reportes" subtitle="Genera y descarga reportes" />
      <div className="p-6">
        <PageHeader
          title="Reportes"
          description="Genera reportes operativos, de salud y de auditoría para tu infraestructura SAP"
        />

        {/* ── Grid de tipos de reporte ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {reportTypes.map((rt: any) => {
            const Icon = rt.icon;
            const isGenerating = generating === rt.key;
            return (
              <Card key={rt.key} padding="md" className="flex flex-col items-center text-center">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${(cardColors as Record<string, string>)[rt.color]}`}>
                  <Icon size={24} className={(iconColors as Record<string, string>)[rt.color]} />
                </div>
                <h3 className="text-base font-semibold text-text-primary">{rt.label}</h3>
                <p className="text-xs text-text-secondary mt-1 mb-4">{rt.description}</p>
                <Button
                  size="sm"
                  variant="primary"
                  icon={isGenerating ? Loader2 : FileText}
                  loading={isGenerating}
                  disabled={generating !== null}
                  onClick={() => handleGenerate(rt.key)}
                  className="w-full"
                >
                  {isGenerating ? 'Generando...' : 'Generar'}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* ── Tabla de reportes generados ── */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Reportes generados</h2>

          {reports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin reportes"
              description="Genera un reporte desde las tarjetas de arriba"
            />
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acción</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {reports.map((rpt: any) => (
                  <TableRow key={rpt.id}>
                    {/* Fecha */}
                    <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                      {new Date(rpt.fecha).toLocaleString('es-CO', { hour12: false })}
                    </TableCell>

                    {/* Tipo */}
                    <TableCell>
                      <Badge variant="primary" size="md">{tipoLabel(rpt.tipo)}</Badge>
                    </TableCell>

                    {/* Estado */}
                    <TableCell>
                      <Badge variant="success" size="sm" dot>{rpt.estado}</Badge>
                    </TableCell>

                    {/* Acción: Descargar */}
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Download}
                        onClick={() => handleDownload(rpt)}
                      >
                        Descargar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── Toast Notification ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-md ${
            toast.type === 'success'
              ? 'bg-success-50 border-success-200 text-success-700 dark:bg-success-900/30 dark:border-success-800 dark:text-success-400'
              : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle size={16} className="flex-shrink-0" />
            ) : (
              <FileText size={16} className="flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={dismissToast}
              className="ml-auto flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

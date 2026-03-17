import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, Clock, Key, FileText } from 'lucide-react';
import Header from '../components/layout/Header';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';
import { createLogger } from '../lib/logger';

const log = createLogger('CertificatesPage');

function StatusIcon({ status }) {
  if (status === 'ok') return <ShieldCheck size={16} className="text-success-500" />;
  if (status === 'warning') return <AlertTriangle size={16} className="text-warning-500" />;
  return <XCircle size={16} className="text-danger-500" />;
}

function DaysLeftBadge({ days, status }) {
  const variant = status === 'critical' ? 'danger' : status === 'warning' ? 'warning' : 'success';
  return (
    <Badge variant={variant} size="sm" dot>
      {days <= 0 ? 'EXPIRADO' : `${days} días`}
    </Badge>
  );
}

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([dataService.getCertificates(), dataService.getLicenses()]).then(([certs, lics]) => {
      setCertificates(certs);
      setLicenses(lics);
      setLoading(false);
    }).catch((err) => {
      log.warn('Fetch failed', { error: err.message });
      setError('Error al cargar datos. Intenta de nuevo.');
      setLoading(false);
    });
  }, []);

  const criticalCerts = useMemo(() => certificates.filter(c => c.status === 'critical').length, [certificates]);
  const warningCerts = useMemo(() => certificates.filter(c => c.status === 'warning').length, [certificates]);
  const okCerts = useMemo(() => certificates.filter(c => c.status === 'ok').length, [certificates]);
  const warningLics = useMemo(() => licenses.filter(l => l.status === 'warning').length, [licenses]);

  if (loading) return <PageLoading message="Cargando certificados..." />;

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
      <Header title="Certificados & Licencias" subtitle="Tracker de expiración — evita interrupciones por vencimiento" />
      <div className="p-6 space-y-6">
        {/* KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center">
                <XCircle size={20} className="text-danger-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-danger-600">{criticalCerts}</p>
                <p className="text-xs text-text-secondary">Cert. Expirados</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-warning-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning-600">{warningCerts + warningLics}</p>
                <p className="text-xs text-text-secondary">Por Vencer</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                <ShieldCheck size={20} className="text-success-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success-600">{okCerts}</p>
                <p className="text-xs text-text-secondary">Cert. Vigentes</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Key size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{licenses.length}</p>
                <p className="text-xs text-text-secondary">Licencias SAP</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Certificates Table */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="flex items-center gap-2">
              <FileText size={18} />
              Certificados SSL / PSE / SNC
            </CardTitle>
            <Badge variant="primary" size="sm">{certificates.length} total</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Estado</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>CN / Subject</TableHead>
                <TableHead>Emisor</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Días</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {certificates
                .sort((a, b) => a.daysLeft - b.daysLeft)
                .map(cert => (
                <TableRow key={cert.id}>
                  <TableCell>
                    <StatusIcon status={cert.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary" size="sm">{cert.sid}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-text-primary font-medium">
                    {cert.type}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-text-secondary">
                    {cert.cn || cert.name || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {cert.issuer}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                    {cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString('es-CO') : '—'}
                  </TableCell>
                  <TableCell>
                    <DaysLeftBadge days={cert.daysLeft} status={cert.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Licenses Table */}
        <Card padding="none">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="flex items-center gap-2">
              <Key size={18} />
              Licencias SAP (SLICENSE)
            </CardTitle>
            <Badge variant="primary" size="sm">{licenses.length} total</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Estado</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Hardware Key</TableHead>
                <TableHead>Válido Desde</TableHead>
                <TableHead>Válido Hasta</TableHead>
                <TableHead>Días</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {licenses
                .sort((a, b) => a.daysLeft - b.daysLeft)
                .map(lic => (
                <TableRow key={lic.id}>
                  <TableCell>
                    <StatusIcon status={lic.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary" size="sm">{lic.sid}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-text-primary font-medium">
                    {lic.type}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-text-secondary">
                    {lic.hardwareKey}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {lic.validFrom}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {lic.validUntil}
                  </TableCell>
                  <TableCell>
                    <DaysLeftBadge days={lic.daysLeft} status={lic.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Critical alert */}
        {criticalCerts > 0 && (
          <Card className="border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-danger-100 dark:bg-danger-900/40 flex items-center justify-center">
                <XCircle size={20} className="text-danger-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {criticalCerts} certificado{criticalCerts > 1 ? 's' : ''} expirado{criticalCerts > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-text-secondary">
                  Acción inmediata requerida. Los certificados expirados pueden causar interrupciones en conexiones HTTPS, RFC y PI/PO.
                </p>
              </div>
              <Clock size={16} className="text-danger-500 ml-auto flex-shrink-0" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

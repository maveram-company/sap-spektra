import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import Header from '../components/layout/Header';
import PageHeader from '../components/layout/PageHeader';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Select from '../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import FeatureGate, { UpgradeBanner } from '../components/ui/FeatureGate';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';

export default function AnalyticsPage() {
  const [selectedSystem, setSelectedSystem] = useState('all');
  const [data, setData] = useState(null);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dataService.getAnalytics(), dataService.getSystems()]).then(([anl, sys]) => {
      setData(anl);
      setSystems(sys);
      setLoading(false);
    });
  }, []);

  if (loading || !data) return <PageLoading message="Cargando analytics..." />;

  const pieData = [
    { name: 'Exitosos', value: data.totalExecutions - data.failedCount, color: '#22c55e' },
    { name: 'Fallidos', value: data.failedCount, color: '#ef4444' },
  ];

  return (
    <div>
      <Header title="Analytics" subtitle="Métricas de ejecución de runbooks" />
      <div className="p-6">
        <PageHeader
          title="Analytics de Runbooks"
          description="Análisis de rendimiento y tendencias de automatización"
          actions={
            <Select
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
              options={[
                { value: 'all', label: 'Todos los sistemas' },
                ...systems.map(s => ({ value: s.id, label: `${s.sid} - ${s.type}` }))
              ]}
            />
          }
        />

        <FeatureGate feature="analytics" fallback={<UpgradeBanner feature="Analytics de Runbooks" className="mb-6" />}>
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { icon: Activity, label: 'Total Ejecuciones', value: data.totalExecutions, color: 'text-primary-600' },
                { icon: CheckCircle, label: 'Tasa de Éxito', value: `${data.successRate}%`, color: 'text-success-600' },
                { icon: AlertTriangle, label: 'Fallidas', value: data.failedCount, color: 'text-danger-600' },
                { icon: TrendingUp, label: 'Promedio/Día', value: data.avgPerDay, color: 'text-accent-600' },
              ].map((kpi, i) => (
                <Card key={i}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center">
                      <kpi.icon size={20} className={kpi.color} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-text-primary">{kpi.value}</p>
                      <p className="text-xs text-text-secondary">{kpi.label}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Tendencia Diaria</CardTitle></CardHeader>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} stroke="var(--color-text-tertiary)" fontSize={11} />
                      <YAxis stroke="var(--color-text-tertiary)" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }} />
                      <Legend />
                      <Bar dataKey="success" fill="#22c55e" name="Exitosos" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="failed" fill="#ef4444" name="Fallidos" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <CardHeader><CardTitle>Distribución</CardTitle></CardHeader>
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* Top Runbooks Table */}
            <Card>
              <CardHeader><CardTitle>Top Runbooks</CardTitle></CardHeader>
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Runbook</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ejecuciones</TableHead>
                    <TableHead>Tasa de Éxito</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {data.topRunbooks.map(rb => (
                    <TableRow key={rb.id}>
                      <TableCell><code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">{rb.id}</code></TableCell>
                      <TableCell className="font-medium">{rb.name}</TableCell>
                      <TableCell>{rb.executions}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${rb.successRate}%`, backgroundColor: rb.successRate > 95 ? '#22c55e' : rb.successRate > 90 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className="text-xs font-medium">{rb.successRate}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        </FeatureGate>
      </div>
    </div>
  );
}

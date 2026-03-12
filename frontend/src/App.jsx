import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TenantProvider } from './contexts/TenantContext';
import { PlanProvider } from './hooks/usePlan';
import ErrorBoundary from './components/ui/ErrorBoundary';
import PageLoading from './components/ui/PageLoading';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SystemsListPage = lazy(() => import('./pages/SystemsListPage'));
const SystemDetailPage = lazy(() => import('./pages/SystemDetailPage'));
const LandscapePage = lazy(() => import('./pages/LandscapePage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const AIAnalysisPage = lazy(() => import('./pages/AIAnalysisPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const RunbooksPage = lazy(() => import('./pages/RunbooksPage'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const OperationsPage = lazy(() => import('./pages/OperationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
const SLAPage = lazy(() => import('./pages/SLAPage'));
const HAControlCenterPage = lazy(() => import('./pages/HAControlCenterPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const BackgroundJobsPage = lazy(() => import('./pages/BackgroundJobsPage'));
const TransportsPage = lazy(() => import('./pages/TransportsPage'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage'));
const ConnectSystemPage = lazy(() => import('./pages/ConnectSystemPage'));
const ConnectorsPage = lazy(() => import('./pages/ConnectorsPage'));
const ProfilePage = lazy(() => import('./pages/settings/ProfilePage'));

// Lazy-loaded settings pages
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'));
const GeneralSettings = lazy(() => import('./pages/settings/GeneralSettings'));
const UsersPage = lazy(() => import('./pages/settings/UsersPage'));
const RolesPage = lazy(() => import('./pages/settings/RolesPage'));
const IntegrationsPage = lazy(() => import('./pages/settings/IntegrationsPage'));
const NotificationsPage = lazy(() => import('./pages/settings/NotificationsPage'));
const BillingPage = lazy(() => import('./pages/settings/BillingPage'));
const AuditLogPage = lazy(() => import('./pages/settings/AuditLogPage'));

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TenantProvider>
            <PlanProvider>
              <Suspense fallback={<PageLoading message="Cargando..." />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  {/* Principal */}
                  <Route index element={<DashboardPage />} />
                  <Route path="systems" element={<SystemsListPage />} />
                  <Route path="systems/:systemId" element={<SystemDetailPage />} />
                  <Route path="landscape" element={<LandscapePage />} />
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="events" element={<EventsPage />} />

                  {/* Inteligencia */}
                  <Route path="ai" element={<AIAnalysisPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="comparison" element={<ComparisonPage />} />

                  {/* Operaciones */}
                  <Route path="runbooks" element={<RunbooksPage />} />
                  <Route path="approvals" element={<ApprovalsPage />} />
                  <Route path="operations" element={<OperationsPage />} />
                  <Route path="sla" element={<SLAPage />} />
                  <Route path="jobs" element={<BackgroundJobsPage />} />
                  <Route path="transports" element={<TransportsPage />} />
                  <Route path="certificates" element={<CertificatesPage />} />

                  {/* HA */}
                  <Route path="ha" element={<HAControlCenterPage />} />

                  {/* Conectores y registro */}
                  <Route path="connectors" element={<ConnectorsPage />} />
                  <Route path="connect" element={<ConnectSystemPage />} />

                  {/* Perfil (accesible a todos) */}
                  <Route path="profile" element={<ProfilePage />} />

                  {/* Admin */}
                  <Route path="admin" element={<ProtectedRoute requiredRole="admin"><AdminPage /></ProtectedRoute>} />

                  {/* Settings */}
                  <Route path="settings" element={<ProtectedRoute requiredRole="escalation"><SettingsLayout /></ProtectedRoute>}>
                    <Route index element={<GeneralSettings />} />
                    <Route path="users" element={<ProtectedRoute requiredRole="admin"><UsersPage /></ProtectedRoute>} />
                    <Route path="roles" element={<RolesPage />} />
                    <Route path="integrations" element={<IntegrationsPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="billing" element={<ProtectedRoute requiredRole="admin"><BillingPage /></ProtectedRoute>} />
                    <Route path="audit" element={<AuditLogPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </PlanProvider>
          </TenantProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

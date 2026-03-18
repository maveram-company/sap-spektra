import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ModeProvider } from './mode/ModeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TenantProvider } from './contexts/TenantContext';
import { PlanProvider } from './hooks/usePlan';
import ErrorBoundary from './components/ui/ErrorBoundary';
import RouteErrorBoundary from './components/ui/RouteErrorBoundary';
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
      <ModeProvider>
      <ThemeProvider>
        <AuthProvider>
          <TenantProvider>
            <PlanProvider>
              <Suspense fallback={<PageLoading message="Cargando..." />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  {/* Principal */}
                  <Route index element={<RouteErrorBoundary><DashboardPage /></RouteErrorBoundary>} />
                  <Route path="systems" element={<RouteErrorBoundary><SystemsListPage /></RouteErrorBoundary>} />
                  <Route path="systems/:systemId" element={<RouteErrorBoundary><SystemDetailPage /></RouteErrorBoundary>} />
                  <Route path="landscape" element={<RouteErrorBoundary><LandscapePage /></RouteErrorBoundary>} />
                  <Route path="alerts" element={<RouteErrorBoundary><AlertsPage /></RouteErrorBoundary>} />
                  <Route path="events" element={<RouteErrorBoundary><EventsPage /></RouteErrorBoundary>} />

                  {/* Inteligencia */}
                  <Route path="ai" element={<RouteErrorBoundary><AIAnalysisPage /></RouteErrorBoundary>} />
                  <Route path="reports" element={<RouteErrorBoundary><ReportsPage /></RouteErrorBoundary>} />
                  <Route path="analytics" element={<RouteErrorBoundary><AnalyticsPage /></RouteErrorBoundary>} />
                  <Route path="comparison" element={<RouteErrorBoundary><ComparisonPage /></RouteErrorBoundary>} />

                  {/* Operaciones */}
                  <Route path="runbooks" element={<RouteErrorBoundary><RunbooksPage /></RouteErrorBoundary>} />
                  <Route path="approvals" element={<RouteErrorBoundary><ApprovalsPage /></RouteErrorBoundary>} />
                  <Route path="operations" element={<RouteErrorBoundary><OperationsPage /></RouteErrorBoundary>} />
                  <Route path="sla" element={<RouteErrorBoundary><SLAPage /></RouteErrorBoundary>} />
                  <Route path="jobs" element={<RouteErrorBoundary><BackgroundJobsPage /></RouteErrorBoundary>} />
                  <Route path="transports" element={<RouteErrorBoundary><TransportsPage /></RouteErrorBoundary>} />
                  <Route path="certificates" element={<RouteErrorBoundary><CertificatesPage /></RouteErrorBoundary>} />

                  {/* HA */}
                  <Route path="ha" element={<RouteErrorBoundary><HAControlCenterPage /></RouteErrorBoundary>} />

                  {/* Conectores y registro */}
                  <Route path="connectors" element={<RouteErrorBoundary><ConnectorsPage /></RouteErrorBoundary>} />
                  <Route path="connect" element={<RouteErrorBoundary><ConnectSystemPage /></RouteErrorBoundary>} />

                  {/* Perfil (accesible a todos) */}
                  <Route path="profile" element={<RouteErrorBoundary><ProfilePage /></RouteErrorBoundary>} />

                  {/* Admin */}
                  <Route path="admin" element={<ProtectedRoute requiredRole="admin"><RouteErrorBoundary><AdminPage /></RouteErrorBoundary></ProtectedRoute>} />

                  {/* Settings */}
                  <Route path="settings" element={<ProtectedRoute requiredRole="escalation"><SettingsLayout /></ProtectedRoute>}>
                    <Route index element={<RouteErrorBoundary><GeneralSettings /></RouteErrorBoundary>} />
                    <Route path="users" element={<ProtectedRoute requiredRole="admin"><RouteErrorBoundary><UsersPage /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="roles" element={<RouteErrorBoundary><RolesPage /></RouteErrorBoundary>} />
                    <Route path="integrations" element={<RouteErrorBoundary><IntegrationsPage /></RouteErrorBoundary>} />
                    <Route path="notifications" element={<RouteErrorBoundary><NotificationsPage /></RouteErrorBoundary>} />
                    <Route path="billing" element={<ProtectedRoute requiredRole="admin"><RouteErrorBoundary><BillingPage /></RouteErrorBoundary></ProtectedRoute>} />
                    <Route path="audit" element={<RouteErrorBoundary><AuditLogPage /></RouteErrorBoundary>} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </PlanProvider>
          </TenantProvider>
        </AuthProvider>
      </ThemeProvider>
      </ModeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

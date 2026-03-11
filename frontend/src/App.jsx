import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TenantProvider } from './contexts/TenantContext';
import { PlanProvider } from './hooks/usePlan';
import ErrorBoundary from './components/ui/ErrorBoundary';

import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SystemsListPage from './pages/SystemsListPage';
import SystemDetailPage from './pages/SystemDetailPage';
import LandscapePage from './pages/LandscapePage';
import AlertsPage from './pages/AlertsPage';
import EventsPage from './pages/EventsPage';
import AIAnalysisPage from './pages/AIAnalysisPage';
import ReportsPage from './pages/ReportsPage';
import RunbooksPage from './pages/RunbooksPage';
import ApprovalsPage from './pages/ApprovalsPage';
import OperationsPage from './pages/OperationsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ComparisonPage from './pages/ComparisonPage';
import SLAPage from './pages/SLAPage';
import HAControlCenterPage from './pages/HAControlCenterPage';
import AdminPage from './pages/AdminPage';
import BackgroundJobsPage from './pages/BackgroundJobsPage';
import TransportsPage from './pages/TransportsPage';
import CertificatesPage from './pages/CertificatesPage';
import ConnectSystemPage from './pages/ConnectSystemPage';
import ConnectorsPage from './pages/ConnectorsPage';
import ProfilePage from './pages/settings/ProfilePage';

import SettingsLayout from './pages/settings/SettingsLayout';
import GeneralSettings from './pages/settings/GeneralSettings';
import UsersPage from './pages/settings/UsersPage';
import RolesPage from './pages/settings/RolesPage';
import IntegrationsPage from './pages/settings/IntegrationsPage';
import NotificationsPage from './pages/settings/NotificationsPage';
import BillingPage from './pages/settings/BillingPage';
import AuditLogPage from './pages/settings/AuditLogPage';

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TenantProvider>
            <PlanProvider>
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
            </PlanProvider>
          </TenantProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

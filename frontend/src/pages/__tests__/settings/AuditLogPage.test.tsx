import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuditLogPage from '../../settings/AuditLogPage';

vi.mock('../../../components/mode', () => ({
  ModeBadge: () => <span data-testid="mode-badge">Mode</span>,
  SourceIndicator: () => <span data-testid="source-indicator">Source</span>,
  EvidencePanel: () => null,
  CapabilityBadge: () => null,
  GovernanceContext: () => null,
}));

vi.mock('../../../services/dataService', () => ({
  dataService: {
    getAuditLog: vi.fn().mockResolvedValue([
      { id: 'audit-1', timestamp: '2025-06-01T10:00:00Z', user: 'admin@example.com', action: 'system.register', resource: 'sys-ep1', details: 'Registered system EP1', severity: 'info' },
      { id: 'audit-2', timestamp: '2025-06-01T09:30:00Z', user: 'admin@example.com', action: 'breach.detected', resource: 'sys-ep1', details: 'CPU threshold breach on EP1', severity: 'critical' },
      { id: 'audit-3', timestamp: '2025-06-01T09:00:00Z', user: 'operator@example.com', action: 'runbook.execute', resource: 'rb-001', details: 'Executed restart runbook', severity: 'warning' },
    ]),
  },
}));

describe('AuditLogPage', () => {
  it('renders the audit log heading', async () => {
    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Log de Auditoría')).toBeInTheDocument();
      expect(screen.getByText('Registro de todas las acciones en la plataforma')).toBeInTheDocument();
    });
  });

  it('renders audit log entries', async () => {
    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Sistema registrado')).toBeInTheDocument();
      expect(screen.getByText('Breach detectado')).toBeInTheDocument();
      expect(screen.getByText('Runbook ejecutado')).toBeInTheDocument();
    });
  });

  it('renders table column headers', async () => {
    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Fecha')).toBeInTheDocument();
      expect(screen.getByText('Usuario')).toBeInTheDocument();
      expect(screen.getByText('Acción')).toBeInTheDocument();
      expect(screen.getByText('Recurso')).toBeInTheDocument();
      expect(screen.getByText('Detalle')).toBeInTheDocument();
      expect(screen.getByText('Nivel')).toBeInTheDocument();
    });
  });

  it('renders search input', async () => {
    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Buscar por acción, usuario o detalle...')).toBeInTheDocument();
    });
  });

  it('renders export button', async () => {
    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Exportar CSV')).toBeInTheDocument();
    });
  });
});

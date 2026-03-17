import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OperationsPage from '../OperationsPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test User', username: 'admin', email: 'admin@test.com' } }),
}));

vi.mock('../../services/dataService', () => ({
  dataService: {
    getOperations: vi.fn().mockResolvedValue([
      {
        id: 'OP-001',
        systemId: 'sys-1',
        sid: 'EP1',
        type: 'BACKUP',
        scheduledTime: '2026-03-11T02:00:00Z',
        status: 'SCHEDULED',
        riskLevel: 'LOW',
        requestedBy: 'admin@empresa.com',
        description: 'Daily HANA backup',
        sched: 'Daily 02:00',
        next: '2026-03-12T02:00:00Z',
        last: null,
      },
      {
        id: 'OP-002',
        systemId: 'sys-2',
        sid: 'QP1',
        type: 'MAINTENANCE',
        scheduledTime: '2026-03-10T22:00:00Z',
        status: 'COMPLETED',
        riskLevel: 'MEDIUM',
        requestedBy: 'ops@empresa.com',
        description: 'Kernel update',
        sched: null,
        next: null,
        last: null,
      },
    ]),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', type: 'S/4HANA', environment: 'PRD' },
      { id: 'sys-2', sid: 'QP1', type: 'S/4HANA', environment: 'QAS' },
    ]),
  },
}));

describe('OperationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders operations list', async () => {
    render(
      <MemoryRouter>
        <OperationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('OP-001')).toBeInTheDocument();
      expect(screen.getByText('Daily HANA backup')).toBeInTheDocument();
    });
  });

  it('displays tab navigation', async () => {
    render(
      <MemoryRouter>
        <OperationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Todas')).toBeInTheDocument();
      expect(screen.getByText('Programadas')).toBeInTheDocument();
      expect(screen.getByText('Completadas')).toBeInTheDocument();
      expect(screen.getByText('Fallidas')).toBeInTheDocument();
    });
  });

  it('renders Nueva Operacion button', async () => {
    render(
      <MemoryRouter>
        <OperationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Nueva Operación')).toBeInTheDocument();
    });
  });

  it('shows risk level badges', async () => {
    render(
      <MemoryRouter>
        <OperationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('LOW')).toBeInTheDocument();
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    });
  });

  it('shows operation types', async () => {
    render(
      <MemoryRouter>
        <OperationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('BACKUP')).toBeInTheDocument();
      expect(screen.getByText('MAINTENANCE')).toBeInTheDocument();
    });
  });

  it('handles error state', async () => {
    const { dataService } = await import('../../services/dataService');
    (dataService.getOperations as any).mockRejectedValueOnce(new Error('Network error'));
    (dataService.getSystems as any).mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter>
        <OperationsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Error al cargar operaciones')).toBeInTheDocument();
    });
  });
});

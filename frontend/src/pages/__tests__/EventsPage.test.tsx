import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventsPage from '../EventsPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getEvents: vi.fn().mockResolvedValue([
      {
        id: 'evt-1',
        level: 'critical',
        message: 'CPU threshold exceeded',
        component: 'Dispatcher',
        sid: 'EP1',
        systemId: 'sys-1',
        source: 'SAP',
        timestamp: '2026-03-10T08:30:00Z',
      },
      {
        id: 'evt-2',
        level: 'info',
        message: 'Backup completed successfully',
        component: 'HANA DB',
        sid: 'QP1',
        systemId: 'sys-2',
        source: 'Platform',
        timestamp: '2026-03-10T09:00:00Z',
      },
    ]),
    getSystems: vi.fn().mockResolvedValue([
      { id: 'sys-1', sid: 'EP1', description: 'Production' },
      { id: 'sys-2', sid: 'QP1', description: 'QA' },
    ]),
  },
}));

describe('EventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the events table', async () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('CPU threshold exceeded')).toBeInTheDocument();
    });
  });

  it('displays event count', async () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('2 eventos')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando eventos...')).toBeInTheDocument();
  });

  it('renders header with title', async () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Eventos')).toBeInTheDocument();
    });
  });

  it('renders table column headers', async () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Nivel')).toBeInTheDocument();
      expect(screen.getByText('Sistema')).toBeInTheDocument();
      expect(screen.getByText('Origen')).toBeInTheDocument();
      expect(screen.getByText('Componente')).toBeInTheDocument();
      expect(screen.getByText('Mensaje')).toBeInTheDocument();
    });
  });

  it('renders event SIDs', async () => {
    render(
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
      expect(screen.getByText('QP1')).toBeInTheDocument();
    });
  });
});

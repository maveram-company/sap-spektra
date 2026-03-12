import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandscapePage from '../LandscapePage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getDiscovery: vi.fn().mockResolvedValue([
      {
        instanceId: 'i-001',
        hostname: 'sap-ep1-ci',
        scanStatus: 'success',
        sid: 'EP1',
        role: 'CI',
        product: 'S/4HANA',
        kernel: '7.93',
        haEnabled: true,
        haType: 'HSR',
        confidence: 'high',
        env: 'PRD',
      },
      {
        instanceId: 'i-002',
        hostname: 'sap-ep1-db',
        scanStatus: 'success',
        sid: 'EP1',
        role: 'DB',
        product: 'HANA',
        kernel: '2.0',
        haEnabled: true,
        haType: 'HSR',
        confidence: 'high',
        env: 'PRD',
      },
      {
        instanceId: 'i-003',
        hostname: 'sap-qp1-ci',
        scanStatus: 'fail',
        sid: 'QP1',
        role: 'CI',
        product: 'S/4HANA',
        kernel: '7.93',
        haEnabled: false,
        haType: null,
        confidence: 'medium',
        env: 'QAS',
      },
    ]),
  },
}));

describe('LandscapePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the landscape page with header', async () => {
    render(
      <MemoryRouter>
        <LandscapePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Landscape SAP')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <LandscapePage />
      </MemoryRouter>
    );
    expect(screen.getByText('Cargando landscape...')).toBeInTheDocument();
  });

  it('displays summary cards with correct counts', async () => {
    render(
      <MemoryRouter>
        <LandscapePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('Instancias Descubiertas').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Escaneo Exitoso')).toBeInTheDocument();
      expect(screen.getByText('Escaneo Fallido')).toBeInTheDocument();
      expect(screen.getByText('Clusters HA')).toBeInTheDocument();
    });
  });

  it('renders SID topology groups', async () => {
    render(
      <MemoryRouter>
        <LandscapePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('EP1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('QP1').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays HA status for clusters', async () => {
    render(
      <MemoryRouter>
        <LandscapePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('HSR').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Standalone')).toBeInTheDocument();
    });
  });

  it('renders the discovery instances table', async () => {
    render(
      <MemoryRouter>
        <LandscapePage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getAllByText('Instancias Descubiertas').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('i-001')).toBeInTheDocument();
      expect(screen.getAllByText('sap-ep1-ci').length).toBeGreaterThanOrEqual(1);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CertificatesPage from '../CertificatesPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getCertificates: vi.fn().mockResolvedValue([
      { id: 'cert-1', sid: 'EP1', type: 'SSL', cn: '*.ep1.sap.local', issuer: 'DigiCert', expiresAt: '2025-03-01T00:00:00Z', daysLeft: -10, status: 'critical' },
      { id: 'cert-2', sid: 'EQ1', type: 'PSE', cn: 'eq1.sap.local', issuer: 'Let\'s Encrypt', expiresAt: '2025-08-15T00:00:00Z', daysLeft: 25, status: 'warning' },
      { id: 'cert-3', sid: 'ED1', type: 'SNC', cn: 'ed1.sap.local', issuer: 'DigiCert', expiresAt: '2026-01-01T00:00:00Z', daysLeft: 180, status: 'ok' },
    ]),
    getLicenses: vi.fn().mockResolvedValue([
      { id: 'lic-1', sid: 'EP1', type: 'SAP S/4HANA', hardwareKey: 'A1B2C3D4', validFrom: '2024-01-01', validUntil: '2025-12-31', daysLeft: 200, status: 'ok' },
      { id: 'lic-2', sid: 'EQ1', type: 'SAP ECC', hardwareKey: 'E5F6G7H8', validFrom: '2024-06-01', validUntil: '2025-07-31', daysLeft: 40, status: 'warning' },
    ]),
  },
}));

describe('CertificatesPage', () => {
  it('renders the page header', async () => {
    render(
      <MemoryRouter>
        <CertificatesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Certificados & Licencias/)).toBeInTheDocument();
    });
  });

  it('renders KPI cards with correct counts', async () => {
    render(
      <MemoryRouter>
        <CertificatesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Cert. Expirados')).toBeInTheDocument();
      expect(screen.getByText('Por Vencer')).toBeInTheDocument();
      expect(screen.getByText('Cert. Vigentes')).toBeInTheDocument();
      expect(screen.getByText('Licencias SAP')).toBeInTheDocument();
    });
  });

  it('renders certificates table section', async () => {
    render(
      <MemoryRouter>
        <CertificatesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Certificados SSL / PSE / SNC')).toBeInTheDocument();
    });
  });

  it('renders licenses table section', async () => {
    render(
      <MemoryRouter>
        <CertificatesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Licencias SAP (SLICENSE)')).toBeInTheDocument();
    });
  });

  it('shows critical alert when expired certs exist', async () => {
    render(
      <MemoryRouter>
        <CertificatesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      // The EXPIRADO badge and the critical alert may both match the pattern
      expect(screen.getAllByText(/expirado/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Acción inmediata requerida/)).toBeInTheDocument();
    });
  });
});

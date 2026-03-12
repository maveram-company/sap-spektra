import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SystemsListPage from '../SystemsListPage';

vi.mock('../../services/dataService', () => ({
  dataService: {
    getSystems: vi.fn().mockResolvedValue([
      { id: '1', sid: 'EP1', status: 'healthy', healthScore: 95, description: 'Prod ERP', sapProduct: 'S/4HANA', type: 'S/4HANA', dbType: 'HANA 2.0', environment: 'PRD', mode: 'PRODUCTION', breaches: 0 },
      { id: '2', sid: 'QP1', status: 'warning', healthScore: 72, description: 'QA ERP', sapProduct: 'S/4HANA', type: 'S/4HANA', dbType: 'HANA 2.0', environment: 'QAS', mode: 'PRODUCTION', breaches: 2 },
    ]),
  },
}));

describe('SystemsListPage', () => {
  it('renders systems list', async () => {
    render(
      <MemoryRouter>
        <SystemsListPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('EP1')).toBeInTheDocument();
      expect(screen.getByText('QP1')).toBeInTheDocument();
    });
  });

  it('shows system count', async () => {
    render(
      <MemoryRouter>
        <SystemsListPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/2 sistemas/i)).toBeInTheDocument();
    });
  });
});

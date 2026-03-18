import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test', role: 'admin', organization: { name: 'Test Org' } },
    isAuthenticated: true,
    hasRole: () => true,
    logout: vi.fn(),
  }),
}));

vi.mock('../../../hooks/usePlan', () => ({
  usePlan: () => ({
    currentPlan: { name: 'Professional', tier: 'professional' },
    hasFeature: () => true,
  }),
}));

vi.mock('../../../contexts/TenantContext', () => ({
  useTenant: () => ({
    organization: {
      name: 'Test Org',
      limits: { maxSystems: 25 },
      usage: { systems: 5 },
    },
  }),
}));

vi.mock('../../../contexts/SidebarContext', () => ({
  useSidebar: () => ({
    collapsed: false,
    toggle: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../../services/dataService', () => ({
  dataService: {
    getApprovals: vi.fn().mockResolvedValue([]),
    getAlerts: vi.fn().mockResolvedValue([]),
  },
}));

describe('Sidebar', () => {
  it('renders the SAP Spektra logo text', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('SAP Spektra')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('nav.dashboard')).toBeInTheDocument();
    expect(screen.getByText('nav.systems')).toBeInTheDocument();
    expect(screen.getByText('nav.alerts')).toBeInTheDocument();
  });

  it('renders section headers', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Command Center')).toBeInTheDocument();
    expect(screen.getByText('Monitor')).toBeInTheDocument();
  });

  it('renders collapse button with aria-label', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const collapseBtn = screen.getByLabelText('sidebar.collapseSidebar');
    expect(collapseBtn).toBeInTheDocument();
  });

  it('renders plan badge', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });
});

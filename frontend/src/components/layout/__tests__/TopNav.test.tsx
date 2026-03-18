import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopNav from '../TopNav';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', role: 'admin', organization: { name: 'Test Org' } },
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
    organization: { name: 'Test Org' },
  }),
}));

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'dark',
    toggleTheme: vi.fn(),
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
    getSystems: vi.fn().mockResolvedValue([]),
    getApprovals: vi.fn().mockResolvedValue([]),
    getAlerts: vi.fn().mockResolvedValue([]),
  },
}));

describe('TopNav', () => {
  it('renders the SAP Spektra logo text', () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );
    expect(screen.getByText('SAP Spektra')).toBeInTheDocument();
  });

  it('renders navigation section buttons', () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );
    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.getByText('Monitor')).toBeInTheDocument();
    expect(screen.getByText('Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });

  it('renders theme toggle with aria-label', () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('topnav.lightMode')).toBeInTheDocument();
  });

  it('renders user avatar with first letter', () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders mobile hamburger button', () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );
    const hamburger = screen.getByLabelText('Abrir menú de navegación');
    expect(hamburger).toBeInTheDocument();
  });
});

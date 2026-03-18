import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Tabs from '../Tabs';

const sampleTabs = [
  { value: 'overview', label: 'Resumen' },
  { value: 'details', label: 'Detalles' },
  { value: 'history', label: 'Historial' },
];

describe('Tabs', () => {
  // ── Rendering ──
  it('renders all tab labels', () => {
    render(<Tabs tabs={sampleTabs} activeTab="overview" onChange={() => {}} />);
    expect(screen.getByText('Resumen')).toBeInTheDocument();
    expect(screen.getByText('Detalles')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
  });

  it('renders a tablist role container', () => {
    render(<Tabs tabs={sampleTabs} activeTab="overview" onChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('renders each tab with role="tab"', () => {
    render(<Tabs tabs={sampleTabs} activeTab="overview" onChange={() => {}} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  // ── Active tab ──
  it('marks active tab with aria-selected="true"', () => {
    render(<Tabs tabs={sampleTabs} activeTab="details" onChange={() => {}} />);
    expect(screen.getByText('Detalles').closest('button')).toHaveAttribute('aria-selected', 'true');
  });

  it('marks inactive tabs with aria-selected="false"', () => {
    render(<Tabs tabs={sampleTabs} activeTab="details" onChange={() => {}} />);
    expect(screen.getByText('Resumen').closest('button')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Historial').closest('button')).toHaveAttribute('aria-selected', 'false');
  });

  // ── onChange ──
  it('calls onChange when a tab is clicked', () => {
    const handler = vi.fn();
    render(<Tabs tabs={sampleTabs} activeTab="overview" onChange={handler} />);
    fireEvent.click(screen.getByText('Detalles'));
    expect(handler).toHaveBeenCalledWith('details');
  });

  it('calls onChange with correct value for each tab', () => {
    const handler = vi.fn();
    render(<Tabs tabs={sampleTabs} activeTab="overview" onChange={handler} />);
    fireEvent.click(screen.getByText('Historial'));
    expect(handler).toHaveBeenCalledWith('history');
  });

  // ── Tab count ──
  it('shows tab count when provided', () => {
    const tabsWithCount = [
      { value: 'alerts', label: 'Alertas', count: 5 },
      { value: 'events', label: 'Eventos', count: 12 },
    ];
    render(<Tabs tabs={tabsWithCount} activeTab="alerts" onChange={() => {}} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('does not render count span when count is undefined', () => {
    render(<Tabs tabs={sampleTabs} activeTab="overview" onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.querySelector('.rounded-full')).not.toBeInTheDocument();
    });
  });

  it('shows count of 0 when count is explicitly 0', () => {
    const tabsWithZero = [{ value: 'empty', label: 'Vacío', count: 0 }];
    render(<Tabs tabs={tabsWithZero} activeTab="empty" onChange={() => {}} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../StatusBadge';

describe('StatusBadge', () => {
  // ── Core statuses ──
  it('renders "Saludable" for healthy status', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByText('Saludable')).toBeInTheDocument();
  });

  it('renders "Atención" for warning status', () => {
    render(<StatusBadge status="warning" />);
    expect(screen.getByText('Atención')).toBeInTheDocument();
  });

  it('renders "Degradado" for degraded status', () => {
    render(<StatusBadge status="degraded" />);
    expect(screen.getByText('Degradado')).toBeInTheDocument();
  });

  it('renders "Crítico" for critical status', () => {
    render(<StatusBadge status="critical" />);
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  // ── Additional statuses ──
  it('renders "Offline" for offline status', () => {
    render(<StatusBadge status="offline" />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders "Pendiente" for pending status', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('renders "Aprobado" for approved status', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText('Aprobado')).toBeInTheDocument();
  });

  it('renders "Rechazado" for rejected status', () => {
    render(<StatusBadge status="rejected" />);
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
  });

  it('renders "Ejecutando" for executing status', () => {
    render(<StatusBadge status="executing" />);
    expect(screen.getByText('Ejecutando')).toBeInTheDocument();
  });

  it('renders "Completado" for completed status', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });

  it('renders "Fallido" for failed status', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Fallido')).toBeInTheDocument();
  });

  it('renders "Programado" for scheduled status', () => {
    render(<StatusBadge status="scheduled" />);
    expect(screen.getByText('Programado')).toBeInTheDocument();
  });

  // ── ARIA attributes ──
  it('has role="status"', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has correct aria-label for healthy', () => {
    render(<StatusBadge status="healthy" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Estado: Saludable');
  });

  it('has correct aria-label for critical', () => {
    render(<StatusBadge status="critical" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Estado: Crítico');
  });

  // ── Case insensitivity ──
  it('handles uppercase status', () => {
    render(<StatusBadge status="HEALTHY" />);
    expect(screen.getByText('Saludable')).toBeInTheDocument();
  });

  it('handles mixed case status', () => {
    render(<StatusBadge status="Warning" />);
    expect(screen.getByText('Atención')).toBeInTheDocument();
  });

  // ── Unknown status fallback ──
  it('falls back to raw status string for unknown status', () => {
    render(<StatusBadge status="unknown-status" />);
    expect(screen.getByText('unknown-status')).toBeInTheDocument();
  });

  it('uses default variant for unknown status', () => {
    render(<StatusBadge status="custom" />);
    const badge = screen.getByText('custom');
    expect(badge.className).toContain('bg-white/5');
  });

  // ── Size prop ──
  it('passes size prop to Badge', () => {
    render(<StatusBadge status="healthy" size="sm" />);
    const badge = screen.getByText('Saludable');
    expect(badge.className).toContain('text-[10px]');
  });

  it('passes size prop as lg to Badge', () => {
    render(<StatusBadge status="healthy" size="lg" />);
    const badge = screen.getByText('Saludable');
    expect(badge.className).toContain('text-sm');
  });

  // ── className prop ──
  it('passes className to Badge', () => {
    render(<StatusBadge status="healthy" className="extra" />);
    expect(screen.getByText('Saludable').className).toContain('extra');
  });

  // ── Trial and production statuses (no dot) ──
  it('renders "Trial" for trial status', () => {
    render(<StatusBadge status="trial" />);
    expect(screen.getByText('Trial')).toBeInTheDocument();
  });

  it('renders "Producción" for production status', () => {
    render(<StatusBadge status="production" />);
    expect(screen.getByText('Producción')).toBeInTheDocument();
  });
});

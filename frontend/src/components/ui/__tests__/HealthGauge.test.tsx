import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthGauge from '../HealthGauge';

describe('HealthGauge', () => {
  // ── Rendering ──
  it('renders with role="img"', () => {
    render(<HealthGauge score={85} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders the numeric score', () => {
    render(<HealthGauge score={75} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('renders the "Health" label', () => {
    render(<HealthGauge score={75} />);
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  // ── Aria labels for different score ranges ──
  it('shows "Saludable" label for score >= 90', () => {
    render(<HealthGauge score={95} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Health score: 95 de 100 — Saludable'
    );
  });

  it('shows "Advertencia" label for score 70-89', () => {
    render(<HealthGauge score={75} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Health score: 75 de 100 — Advertencia'
    );
  });

  it('shows "Degradado" label for score 50-69', () => {
    render(<HealthGauge score={60} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Health score: 60 de 100 — Degradado'
    );
  });

  it('shows "Crítico" label for score < 50', () => {
    render(<HealthGauge score={30} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Health score: 30 de 100 — Crítico'
    );
  });

  // ── Score clamping ──
  it('clamps score to 0 when negative', () => {
    render(<HealthGauge score={-10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Health score: 0 de 100 — Crítico'
    );
  });

  it('clamps score to 100 when above 100', () => {
    render(<HealthGauge score={150} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Health score: 100 de 100 — Saludable'
    );
  });

  // ── Default score ──
  it('defaults to 0 when no score is provided', () => {
    render(<HealthGauge />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // ── SVG rendering ──
  it('renders an SVG element', () => {
    const { container } = render(<HealthGauge score={50} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses aria-hidden on the SVG', () => {
    const { container } = render(<HealthGauge score={50} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  // ── Color mapping ──
  it('uses green color (#22c55e) for score >= 90', () => {
    render(<HealthGauge score={95} />);
    const scoreText = screen.getByText('95');
    expect(scoreText).toHaveStyle({ color: '#22c55e' });
  });

  it('uses amber color (#f59e0b) for score 70-89', () => {
    render(<HealthGauge score={80} />);
    const scoreText = screen.getByText('80');
    expect(scoreText).toHaveStyle({ color: '#f59e0b' });
  });

  it('uses orange color (#f97316) for score 50-69', () => {
    render(<HealthGauge score={55} />);
    const scoreText = screen.getByText('55');
    expect(scoreText).toHaveStyle({ color: '#f97316' });
  });

  it('uses red color (#ef4444) for score < 50', () => {
    render(<HealthGauge score={20} />);
    const scoreText = screen.getByText('20');
    expect(scoreText).toHaveStyle({ color: '#ef4444' });
  });

  // ── Boundary values ──
  it('score 90 is "Saludable" (green)', () => {
    render(<HealthGauge score={90} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Saludable');
    expect(screen.getByText('90')).toHaveStyle({ color: '#22c55e' });
  });

  it('score 89 is "Advertencia" (amber)', () => {
    render(<HealthGauge score={89} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Advertencia');
    expect(screen.getByText('89')).toHaveStyle({ color: '#f59e0b' });
  });

  it('score 70 is "Advertencia" (amber)', () => {
    render(<HealthGauge score={70} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Advertencia');
  });

  it('score 69 is "Degradado" (orange)', () => {
    render(<HealthGauge score={69} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Degradado');
  });

  it('score 50 is "Degradado" (orange)', () => {
    render(<HealthGauge score={50} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Degradado');
  });

  it('score 49 is "Crítico" (red)', () => {
    render(<HealthGauge score={49} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Crítico');
  });

  // ── Custom size and strokeWidth ──
  it('respects custom size prop', () => {
    const { container } = render(<HealthGauge score={50} size={200} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '200');
  });

  // ── Pulsing animation for critical scores ──
  it('includes animate element for critical scores (< 50)', () => {
    const { container } = render(<HealthGauge score={30} />);
    expect(container.querySelector('animate')).toBeInTheDocument();
  });

  it('does not include animate element for non-critical scores', () => {
    const { container } = render(<HealthGauge score={90} />);
    expect(container.querySelector('animate')).not.toBeInTheDocument();
  });
});

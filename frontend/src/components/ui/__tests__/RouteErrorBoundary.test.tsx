import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RouteErrorBoundary from '../RouteErrorBoundary';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  AlertTriangle: (props: any) => <svg data-testid="alert-icon" {...props} />,
  RefreshCw: (props: any) => <svg data-testid="refresh-icon" {...props} />,
}));

// A component that throws on command
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Route error');
  }
  return <div>Route content</div>;
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React's console.error for expected error boundaries
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── Normal rendering ──
  it('renders children when there is no error', () => {
    render(
      <RouteErrorBoundary>
        <div>Safe content</div>
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  // ── Error state ──
  it('renders error UI when a child throws', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Error en esta sección')).toBeInTheDocument();
  });

  it('displays the error message', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Route error')).toBeInTheDocument();
  });

  it('does not render children when error occurred', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.queryByText('Route content')).not.toBeInTheDocument();
  });

  it('renders the alert triangle icon', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
  });

  // ── Retry button ──
  it('shows retry button', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('renders refresh icon in retry button', () => {
    render(
      <RouteErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </RouteErrorBoundary>
    );
    expect(screen.getByTestId('refresh-icon')).toBeInTheDocument();
  });

  it('resets and renders children after clicking retry', () => {
    let shouldThrow = true;
    function Wrapper() {
      if (shouldThrow) throw new Error('Boom');
      return <div>Recovered</div>;
    }

    render(
      <RouteErrorBoundary>
        <Wrapper />
      </RouteErrorBoundary>
    );

    expect(screen.getByText('Error en esta sección')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.queryByText('Error en esta sección')).not.toBeInTheDocument();
  });
});

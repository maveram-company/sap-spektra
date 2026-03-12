import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  AlertTriangle: (props: any) => <svg data-testid="alert-icon" {...props} />,
  RefreshCw: (props: any) => <svg data-testid="refresh-icon" {...props} />,
}));

// A component that throws on command
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test explosion');
  }
  return <div>Child content works</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React's console.error for expected error boundaries
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── Normal rendering ──
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  // ── Error state ──
  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Error inesperado')).toBeInTheDocument();
  });

  it('displays the error message', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
  });

  it('shows descriptive text', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(
      screen.getByText(/algo salió mal/i)
    ).toBeInTheDocument();
  });

  it('renders the alert triangle icon', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
  });

  it('does not render children when error occurred', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child content works')).not.toBeInTheDocument();
  });

  // ── Recovery ──
  it('renders "Reintentar" button in error state', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('resets and renders children again after clicking Reintentar', () => {
    // We'll use a stateful wrapper to control the throw
    let shouldThrow = true;
    function Wrapper() {
      if (shouldThrow) throw new Error('Boom');
      return <div>Recovered content</div>;
    }

    render(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>
    );

    expect(screen.getByText('Error inesperado')).toBeInTheDocument();

    // Now stop throwing and click retry
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByText('Error inesperado')).not.toBeInTheDocument();
  });

  // ── "Ir al inicio" link ──
  it('renders a link to go home', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    const link = screen.getByRole('link', { name: /ir al inicio/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});

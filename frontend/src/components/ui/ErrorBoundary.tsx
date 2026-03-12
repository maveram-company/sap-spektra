import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-secondary p-6">
          <div className="max-w-md w-full bg-surface rounded-2xl border border-border shadow-xl p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-danger-50 dark:bg-danger-900/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-danger-500" />
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Error inesperado</h1>
            <p className="text-sm text-text-secondary mb-4">
              Algo salió mal. Puedes intentar recargar la página o volver al inicio.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-surface-tertiary rounded-lg p-3 mb-4 overflow-auto max-h-32 text-text-secondary">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                <RefreshCw size={14} />
                Reintentar
              </button>
              <a
                href="/"
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
              >
                Ir al inicio
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

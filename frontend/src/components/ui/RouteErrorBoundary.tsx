import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-danger-500/10 flex items-center justify-center mb-4">
            <AlertTriangle size={24} className="text-danger-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Error en esta sección</h2>
          <p className="text-sm text-text-secondary mb-4 max-w-md">
            {this.state.error?.message || 'Ocurrió un error inesperado'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors"
          >
            <RefreshCw size={14} />
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import LoadingSpinner from './LoadingSpinner';

export default function PageLoading({ message = 'Cargando...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" role="status" aria-live="polite">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
}

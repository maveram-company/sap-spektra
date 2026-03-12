import { forwardRef, useId } from 'react';

const Input = forwardRef(({ label, error, hint, icon: Icon, className = '', id: externalId, ...props }, ref) => {
  const autoId = useId();
  const inputId = externalId || autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const describedBy = [error && errorId, hint && !error && hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-tertiary" aria-hidden="true">
            <Icon size={16} />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${Icon ? 'pl-9' : ''} ${error ? 'border-danger-500 focus:ring-danger-500' : 'border-border'}`}
          {...props}
        />
      </div>
      {error && <p id={errorId} className="mt-1 text-xs text-danger-600" role="alert">{error}</p>}
      {hint && !error && <p id={hintId} className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;

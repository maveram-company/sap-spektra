import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
  className?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, options = [], placeholder, className = '', id: externalId, ...props }, ref) => {
  const autoId = useId();
  const selectId = externalId || autoId;
  const errorId = `${selectId}-error`;

  return (
    <div className={className}>
      {label && <label htmlFor={selectId} className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-lg border bg-surface px-3 py-2 pr-8 text-sm text-text-primary appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${error ? 'border-danger-500' : 'border-border'}`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" aria-hidden="true" />
      </div>
      {error && <p id={errorId} className="mt-1 text-xs text-danger-600" role="alert">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';
export default Select;

export default function Table({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border/30 bg-surface/50 backdrop-blur-sm ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHeader({ children }) {
  return <thead className="bg-white/[0.02] border-b border-border/30">{children}</thead>;
}

export function TableRow({ children, className = '', onClick }) {
  const handleKeyDown = onClick ? (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(e);
    }
  } : undefined;

  return (
    <tr
      className={`border-b border-border/30 last:border-0 hover:bg-white/[0.03] transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = '' }) {
  return <th scope="col" className={`px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider ${className}`}>{children}</th>;
}

export function TableCell({ children, className = '' }) {
  return <td className={`px-4 py-3 text-text-primary ${className}`}>{children}</td>;
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-border/30">{children}</tbody>;
}

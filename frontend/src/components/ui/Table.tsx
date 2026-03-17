import type { ReactNode, MouseEvent, KeyboardEvent } from 'react';

interface TableProps { children: ReactNode; className?: string }
interface TableHeaderProps { children: ReactNode }
interface TableRowProps { children: ReactNode; className?: string; onClick?: (e: MouseEvent | KeyboardEvent) => void }
interface TableHeadProps { children?: ReactNode; className?: string }
interface TableCellProps { children: ReactNode; className?: string }
interface TableBodyProps { children: ReactNode }

export default function Table({ children, className = '' }: TableProps) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border/30 bg-surface/50 backdrop-blur-sm ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHeader({ children }: TableHeaderProps) {
  return <thead className="bg-white/[0.02] border-b border-border/30">{children}</thead>;
}

export function TableRow({ children, className = '', onClick }: TableRowProps) {
  const handleKeyDown = onClick ? (e: KeyboardEvent) => {
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

export function TableHead({ children, className = '' }: TableHeadProps) {
  return <th scope="col" className={`px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider ${className}`}>{children}</th>;
}

export function TableCell({ children, className = '' }: TableCellProps) {
  return <td className={`px-4 py-3 text-text-primary ${className}`}>{children}</td>;
}

export function TableBody({ children }: TableBodyProps) {
  return <tbody className="divide-y divide-border/30">{children}</tbody>;
}

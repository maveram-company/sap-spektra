export default function Card({ children, className = '', padding = 'md', hover = false, ...props }) {
  const paddings = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };
  return (
    <div
      className={`bg-surface/80 backdrop-blur-sm rounded-xl border border-border/50 ${paddings[padding]} ${hover ? 'hover:border-primary-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.07)] transition-all duration-300 cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-lg font-semibold text-text-primary ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-sm text-text-secondary mt-1 ${className}`}>{children}</p>;
}

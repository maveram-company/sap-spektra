const variants = {
  default: 'bg-white/5 text-text-secondary border border-white/10',
  primary: 'bg-primary-500/10 text-primary-400 border border-primary-500/20',
  success: 'bg-success-500/10 text-success-400 border border-success-500/20',
  warning: 'bg-warning-500/10 text-warning-400 border border-warning-500/20',
  danger: 'bg-danger-500/10 text-danger-400 border border-danger-500/20',
  info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
};

const sizes = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

export default function Badge({ children, variant = 'default', size = 'md', dot = false, className = '' }: { children: any; variant?: string; size?: string; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-full ${(variants as Record<string, string>)[variant]} ${(sizes as Record<string, string>)[size]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full bg-current`} />}
      {children}
    </span>
  );
}
